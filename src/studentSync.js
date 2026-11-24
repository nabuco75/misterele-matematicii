// Identitatea elevilor după repartizare și anonimizare.
//
// Repartizarea (config/allocation), codurile (colecția `codes`) și notele puse pe nume (colecția `grades`)
// recunosc un elev după „înscriere + nume”. Când un nume se corectează sau un elev e scos, actualizăm aici
// toate trei, ca elevul să-și păstreze sala, codul și notele, iar un elev scos să nu mai ocupe loc.
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { CODES_COLLECTION, normName } from "./contestData";
import { GRADES_COLLECTION, nameGradeId } from "./grading";
import { formatCode } from "./roomLists";

const allocationRef = () => doc(db, "config", "allocation");
const codeCounterRef = () => doc(db, "config", "codeCounter");

// cheia unui elev pentru coduri: înscriere + nume normalizat
export const codeKeyOf = (s) => `${s.regId}|${normName(s.nume)}`;

// Dă coduri elevilor (cheile în ordinea dorită), atomic, de pe oricâte calculatoare:
// config/codeCounter ține ultimul număr (n) și ce număr a primit fiecare elev (keys).
// Un elev care a primit deja un număr (de pe alt calculator, chiar în aceeași secundă)
// îl primește pe ACELAȘI, nu pe al doilea. Un cod retras nu se refolosește.
// Întoarce Map cheie → { n, nou } (nou = documentul de cod trebuie scris de noi).
export const reserveCodes = (keys, scannedMax = 0) =>
  runTransaction(db, async (tx) => {
    const snap = await tx.get(codeCounterRef());
    const data = snap.exists() ? snap.data() : {};
    const given = { ...(data.keys || {}) };
    // citirile înaintea scrierilor: starea codurilor deja date acestor elevi
    // un cod e al acestui elev doar dacă documentul lui are aceeași înscriere și același nume:
    // după o corectare de nume, cheia veche poate trimite la codul ALTUI copil
    const prior = new Map();
    for (const k of keys) {
      if (given[k] && !prior.has(k)) {
        const c = await tx.get(doc(db, CODES_COLLECTION, formatCode(given[k])));
        if (!c.exists()) prior.set(k, "lipsa");
        else {
          const d = c.data();
          const sameStudent = codeKeyOf(d) === k.replace(/#\d+$/, "");
          prior.set(k, d.retras || !sameStudent ? "altul" : "activ");
        }
      }
    }
    let n = Math.max(data.n || 0, scannedMax);
    const out = new Map();
    keys.forEach((k) => {
      const st = prior.get(k);
      if (st === "activ") out.set(k, { n: given[k], nou: false });
      else if (st === "lipsa") out.set(k, { n: given[k], nou: true }); // celălalt calculator încă scrie: aceleași date
      else {
        n += 1;
        given[k] = n;
        out.set(k, { n, nou: true });
      }
    });
    tx.set(codeCounterRef(), { n, keys: given, at: new Date().toISOString() });
    return out;
  });

// Schimbă repartizarea salvată pornind de la documentul proaspăt (tranzacție).
// fn(assignments, walkIns) → { assignments?, walkIns? } de scris, sau null = nimic.
const mutateAssignments = (fn) =>
  runTransaction(db, async (tx) => {
    const snap = await tx.get(allocationRef());
    const data = snap.exists() ? snap.data() : {};
    const patch = fn([...(data.assignments || [])], [...(data.walkIns || [])]);
    if (patch) tx.set(allocationRef(), patch, { merge: true });
  });

// cheia elevului în repartizarea salvată (aceeași ca `id` din loadContestStudents)
export const studentKey = (regId, nume) => `${regId}-${nume}`;

// „regId-nume” → { regId, nume } (id-urile Firestore nu conțin „-”)
const splitKey = (key) => {
  const i = key.indexOf("-");
  return i === -1 ? { regId: key, nume: "" } : { regId: key.slice(0, i), nume: key.slice(i + 1) };
};

const codesOfRegs = async (regIds) => {
  const out = [];
  for (const regId of regIds) {
    const snap = await getDocs(query(collection(db, CODES_COLLECTION), where("regId", "==", regId)));
    snap.forEach((d) => out.push({ cod: d.id, ...d.data() }));
  }
  return out;
};

// Profesorul îndrumător al unor înscrieri: se scrie `patch` (profesorIndrumatorEmail = numele,
// profesorEmail, telefon – doar ce s-a schimbat) pe fiecare înscriere; dacă s-a schimbat numele,
// îl primesc și codurile de anonimizare ale acelor înscrieri (apare pe borderou).
export async function updateTeacher(regIds, patch) {
  const batch = writeBatch(db);
  regIds.forEach((id) => batch.update(doc(db, "registration", id), patch));
  if ("profesorIndrumatorEmail" in patch) {
    for (const c of await codesOfRegs(regIds)) {
      batch.update(doc(db, CODES_COLLECTION, c.cod), { profesor: patch.profesorIndrumatorEmail });
    }
  }
  await batch.commit();
}

// renames: [{ regId, oldName, newName }] → păstrează sala, codul și notele elevilor redenumiți
export async function applyRenames(renames) {
  const list = renames.filter(
    (r) => r.regId && r.oldName && r.newName && r.oldName !== r.newName
  );
  const done = { seats: 0, codes: 0, grades: 0 };
  if (list.length === 0) return done;

  const codeDocs = await codesOfRegs([...new Set(list.map((r) => r.regId))]);

  const batch = writeBatch(db);
  const usedCodes = new Set();
  for (const r of list) {
    // codul: după înscriere + numele vechi
    const c = codeDocs.find(
      (x) => !usedCodes.has(x.cod) && !x.retras && x.regId === r.regId && normName(x.nume) === normName(r.oldName)
    );
    if (c) {
      usedCodes.add(c.cod);
      batch.update(doc(db, CODES_COLLECTION, c.cod), { nume: r.newName, numeAnterior: c.nume });
      done.codes++;
    }


    // notele puse pe nume (înainte de coduri) trec pe numele nou
    const oldG = nameGradeId({ regId: r.regId, nume: r.oldName });
    const newG = nameGradeId({ regId: r.regId, nume: r.newName });
    if (oldG !== newG) {
      const g = await getDoc(doc(db, GRADES_COLLECTION, oldG));
      if (g.exists()) {
        batch.set(doc(db, GRADES_COLLECTION, newG), g.data(), { merge: true });
        batch.delete(doc(db, GRADES_COLLECTION, oldG));
        done.grades++;
      }
    }
  }
  await batch.commit();

  // sala: locul din repartizarea salvată trece pe numele nou; la fel elevii veniți pe loc
  // (jurnalul pentru procesul-verbal). Pe documentul proaspăt, ca să nu ștergem ce a salvat
  // între timp alt calculator.
  await mutateAssignments((assignments, walkIns) => {
    let seats = 0;
    let walkInsChanged = false;
    for (const r of list) {
      const oldKey = studentKey(r.regId, r.oldName);
      const same = (id) =>
        id === oldKey || (splitKey(id).regId === r.regId && normName(splitKey(id).nume) === normName(r.oldName));
      const idx = assignments.findIndex((a) => same(a.id));
      if (idx !== -1) {
        assignments[idx] = { ...assignments[idx], id: studentKey(r.regId, r.newName) };
        seats++;
      }
      walkIns.forEach((w, i) => {
        if (same(w.id)) {
          walkIns[i] = { ...w, id: studentKey(r.regId, r.newName), nume: r.newName };
          walkInsChanged = true;
        }
      });
    }
    done.seats = seats;
    if (!seats && !walkInsChanged) return null;
    return { assignments, ...(walkInsChanged ? { walkIns } : {}) };
  });
  return done;
}

// removals: [{ regId, nume }] → elevul scos nu mai ocupă loc în sală; codul lui devine „retras”
// (nu se mai dă altcuiva și nu mai apare ca avertizare). Notele lui rămân în baza de date.
export async function applyRemovals(removals) {
  const list = removals.filter((r) => r.regId && r.nume);
  const done = { seats: 0, codes: 0 };
  if (list.length === 0) return done;

  const codeDocs = await codesOfRegs([...new Set(list.map((r) => r.regId))]);

  const batch = writeBatch(db);
  const usedCodes = new Set();
  for (const r of list) {
    const c = codeDocs.find(
      (x) => !usedCodes.has(x.cod) && !x.retras && x.regId === r.regId && normName(x.nume) === normName(r.nume)
    );
    if (c) {
      usedCodes.add(c.cod);
      batch.update(doc(db, CODES_COLLECTION, c.cod), { retras: true, retrasLa: new Date().toISOString() });
      done.codes++;
    }
  }
  await batch.commit();

  // locul din sală se eliberează pe repartizarea proaspătă
  await mutateAssignments((assignments) => {
    const removeKeys = new Set();
    for (const r of list) {
      assignments.forEach((a) => {
        const k = splitKey(a.id);
        if (a.id === studentKey(r.regId, r.nume) || (k.regId === r.regId && normName(k.nume) === normName(r.nume))) {
          removeKeys.add(a.id);
        }
      });
    }
    done.seats = removeKeys.size;
    if (!removeKeys.size) return null;
    return { assignments: assignments.filter((a) => !removeKeys.has(a.id)) };
  });
  return done;
}

// cât de asemănătoare sunt două nume (pentru sugestii): cel mai lung început comun între cuvinte
const similarity = (a, b) => {
  const ta = normName(a).split(" ").filter(Boolean);
  const tb = normName(b).split(" ").filter(Boolean);
  let best = 0;
  ta.forEach((x) =>
    tb.forEach((y) => {
      let n = 0;
      while (n < x.length && n < y.length && x[n] === y[n]) n++;
      best = Math.max(best, n);
    })
  );
  return best;
};

// Compară elevii înscriși acum cu repartizarea salvată și cu codurile:
//   newcomers – elevi fără sală (înscriși după repartizare sau cu nume corectat);
//   ghosts    – elevi din repartizare/coduri care nu mai apar în înscrieri (redenumiți sau scoși);
//   pairs     – sugestii „fantomă ↔ elev fără sală” din aceeași înscriere (probabil nume corectat);
//   realNew   – elevii fără sală care nu fac parte dintr-o pereche sugerată (cu adevărat noi).
export function diffWithAllocation(students, assignments, orphanCodes = []) {
  const current = new Set(students.map((s) => s.id));
  const newcomers = students.filter((s) => !assignments?.get(s.id) && !(s.cod && s.salaCod));

  const ghostMap = new Map();
  const ghostKey = (regId, nume) => `${regId}|${normName(nume)}`;
  (assignments ? [...assignments.entries()] : []).forEach(([id, sala]) => {
    if (current.has(id)) return;
    const { regId, nume } = splitKey(id);
    ghostMap.set(ghostKey(regId, nume), { regId, nume, sala, cod: "" });
  });
  orphanCodes
    .filter((c) => !c.retras)
    .forEach((c) => {
      const k = ghostKey(c.regId, c.nume);
      const g = ghostMap.get(k) || { regId: c.regId, nume: c.nume, sala: c.salaLaAtribuire || "", cod: "" };
      ghostMap.set(k, { ...g, cod: c.cod });
    });
  const ghosts = [...ghostMap.values()];

  // perechi sugerate: în aceeași înscriere, cele mai asemănătoare nume întâi
  const candidates = [];
  ghosts.forEach((g, gi) =>
    newcomers.forEach((s) => {
      if (s.regId === g.regId) candidates.push({ gi, s, score: similarity(g.nume, s.nume) });
    })
  );
  candidates.sort((a, b) => b.score - a.score);
  const pairs = [];
  const usedGhost = new Set();
  const usedStudent = new Set();
  candidates.forEach(({ gi, s }) => {
    if (usedGhost.has(gi) || usedStudent.has(s.id)) return;
    usedGhost.add(gi);
    usedStudent.add(s.id);
    pairs.push({ ghost: ghosts[gi], student: s });
  });

  return {
    newcomers,
    ghosts,
    pairs,
    realNew: newcomers.filter((s) => !usedStudent.has(s.id)),
    unpairedGhosts: ghosts.filter((_, i) => !usedGhost.has(i)),
  };
}

// Anulează anonimizarea: șterge toate codurile (doar dacă nu există nicio notă).
// Întoarce { blocked: număr elevi cu note } dacă nu se poate, altfel { deleted }.
export async function cancelAnonymization() {
  const codesSnap = await getDocs(collection(db, CODES_COLLECTION));
  const codeIds = codesSnap.docs.map((d) => d.id);
  const codeSet = new Set(codeIds);

  // notele trecute pe coduri blochează anularea (cele trecute pe nume nu depind de coduri)
  const gradesSnap = await getDocs(collection(db, GRADES_COLLECTION));
  const withGrades = gradesSnap.docs.filter((d) => {
    if (!codeSet.has(d.id)) return false;
    const g = d.data();
    return ["s1", "s2", "s3"].some((k) => typeof g[k] === "number") || g.absent || g.premiu;
  });
  if (withGrades.length > 0) return { blocked: withGrades.length };
  // documente de note goale legate de coduri (codurile se vor da din nou, altor elevi)
  const emptyGradeIds = gradesSnap.docs.map((d) => d.id).filter((id) => codeSet.has(id));
  const toDelete = [
    ...codeIds.map((id) => doc(db, CODES_COLLECTION, id)),
    ...emptyGradeIds.map((id) => doc(db, GRADES_COLLECTION, id)),
  ];
  for (let i = 0; i < toDelete.length; i += 400) {
    const batch = writeBatch(db);
    toDelete.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  // numerotarea codurilor o ia de la capăt (MMVS_01)
  await setDoc(codeCounterRef(), { n: 0, at: new Date().toISOString() });
  return { deleted: codeIds.length };
}

// după anulare: biletele „elevi noi” nu mai sunt valabile
export const clearLastNewCodes = () =>
  setDoc(allocationRef(), { lastNewCodes: deleteField(), codeBatches: deleteField() }, { merge: true });
