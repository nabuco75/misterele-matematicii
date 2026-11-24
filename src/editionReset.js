// Pregătirea ediției noi: întâi o copie completă a datelor (Excel lizibil + JSON complet),
// apoi golirea în ordinea corectă: note → coduri → înscrieri → repartizare → contorul de coduri
// → contoarele publice de locuri. Școlile, sălile, antetul și starea înscrierilor rămân.
import XLSX from "xlsx-js-style";
import * as FileSaver from "file-saver";
import { collection, deleteDoc, doc, getDoc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { rebuildClassCounts } from "./classCounts";

const COLLECTIONS = ["registration", "codes", "grades", "schools", "rooms", "classCounts"];
const CONFIG_DOCS = ["allocation", "codeCounter", "settings", "appStatus"];

const plain = (v) => {
  if (v && typeof v.toDate === "function") return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
};
// Excel nu acceptă mai mult de 32767 caractere într-o celulă (repartizarea mare ar depăși):
// textul se taie, iar varianta completă e oricum în fișierul JSON
const MAX_CELL = 32000;
const cell = (v) => {
  const p = plain(v);
  if (p === null || p === undefined) return "";
  let out = p;
  if (Array.isArray(p)) out = p.map((x) => (typeof x === "object" ? JSON.stringify(x) : x)).join("; ");
  else if (typeof p === "object") out = JSON.stringify(p);
  if (typeof out === "string" && out.length > MAX_CELL) out = `${out.slice(0, MAX_CELL)} …[tăiat — vezi fișierul JSON]`;
  return out;
};
const stamp = () => new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");

// citește tot ce se șterge (și ce rămâne, pentru referință)
export const readEverything = async () => {
  const out = { exportedAt: new Date().toISOString(), collections: {}, config: {} };
  for (const name of COLLECTIONS) {
    const snap = await getDocs(collection(db, name));
    out.collections[name] = snap.docs.map((d) => ({ id: d.id, ...plain(d.data()) }));
  }
  for (const id of CONFIG_DOCS) {
    const snap = await getDoc(doc(db, "config", id));
    if (snap.exists()) out.config[id] = plain(snap.data());
  }
  return out;
};

const sheetFrom = (rows) => {
  if (rows.length === 0) return XLSX.utils.aoa_to_sheet([["(gol)"]]);
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const ws = XLSX.utils.aoa_to_sheet([keys, ...rows.map((r) => keys.map((k) => cell(r[k])))]);
  ws["!cols"] = keys.map((k) => ({ wch: Math.min(40, Math.max(8, k.length + 2)) }));
  return ws;
};

// câte documente are fiecare colecție (pentru a compara copia cu ce e acum în baza de date)
export const countsOf = (data) =>
  Object.fromEntries(Object.entries(data.collections).map(([k, v]) => [k, v.length]));

// salvează copia: întâi JSON-ul complet (cel mai important), apoi un Excel de citit
// (câte o foaie pe colecție, plus elevii pe rânduri). Întoarce { elevi, excelOk }.
export const downloadBackup = (data) => {
  const when = stamp();
  FileSaver.saveAs(
    new Blob([JSON.stringify(data, null, 1)], { type: "application/json;charset=UTF-8" }),
    `Copie_completa_concurs_${when}.json`
  );
  const schools = new Map(data.collections.schools.map((s) => [s.id, s]));
  const codeByKey = new Map(
    data.collections.codes.filter((c) => !c.retras).map((c) => [`${c.regId}|${c.nume}`, c.id])
  );
  const elevi = data.collections.registration.flatMap((r) =>
    (r.students || []).map((st) => {
      const nume = typeof st === "string" ? st : st?.nume || "";
      return {
        nume,
        clasa: r.class,
        scoala: schools.get(r.schoolId)?.name || r.school || "",
        localitate: schools.get(r.schoolId)?.locality || "",
        profesor: r.profesorIndrumatorEmail || "",
        email: r.profesorEmail || "",
        telefon: r.telefon || "",
        cod: codeByKey.get(`${r.id}|${nume}`) || "",
        inscriere: r.id,
      };
    })
  );
  let excelOk = true;
  try {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheetFrom(elevi), "Elevi");
    COLLECTIONS.forEach((name) => XLSX.utils.book_append_sheet(wb, sheetFrom(data.collections[name]), name));
    XLSX.utils.book_append_sheet(
      wb,
      sheetFrom(Object.entries(data.config).map(([id, v]) => ({ id, ...v }))),
      "config"
    );
    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    FileSaver.saveAs(
      new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8" }),
      `Copie_completa_concurs_${when}.xlsx`
    );
  } catch (err) {
    console.error("Excelul copiei nu a putut fi generat (JSON-ul s-a salvat):", err);
    excelOk = false;
  }
  return { elevi: elevi.length, excelOk };
};

// înainte de golire: înscrierile trebuie să fie închise, iar de la copie să nu fi apărut date noi
// (o notă sau o înscriere salvată după copie s-ar pierde). Întoarce un text de eroare sau "".
export const checkBeforeReset = async (backupCounts) => {
  const st = await getDoc(doc(db, "config", "appStatus"));
  if (st.exists() && st.data().isActive === true) {
    return "Înscrierile sunt DESCHISE. Închideți-le întâi (Firestore → config → appStatus → isActive: false), apoi reveniți.";
  }
  for (const name of ["registration", "codes", "grades"]) {
    const now = (await getDocs(collection(db, name))).size;
    // mai puține = o golire începută și oprită (se poate relua); mai multe = date noi, nesalvate în copie
    if (now > backupCounts[name]) {
      return `De la copie s-au schimbat datele (${name}: ${backupCounts[name]} → ${now}). Descărcați din nou copia, apoi goliți.`;
    }
  }
  return "";
};

const deleteAll = async (name, onStep) => {
  const snap = await getDocs(collection(db, name));
  const refs = snap.docs.map((d) => d.ref);
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
    onStep?.(`${name}: ${Math.min(i + 400, refs.length)} / ${refs.length}`);
  }
  return refs.length;
};

// Golește datele ediției. onStep(text) arată progresul. Întoarce câte s-au șters.
// Dacă se oprește la mijloc, se poate rula din nou: fiecare pas șterge doar ce a rămas.
export const resetEdition = async (onStep) => {
  const done = {};
  onStep?.("Se șterg notele...");
  done.grades = await deleteAll("grades", onStep);
  onStep?.("Se șterg codurile de anonimizare...");
  done.codes = await deleteAll("codes", onStep);
  onStep?.("Se șterg înscrierile...");
  done.registration = await deleteAll("registration", onStep);
  onStep?.("Se șterge repartizarea pe săli și contorul de coduri...");
  await deleteDoc(doc(db, "config", "allocation"));
  await deleteDoc(doc(db, "config", "codeCounter"));
  onStep?.("Se recalculează locurile libere ale școlilor...");
  await rebuildClassCounts();
  return done;
};
