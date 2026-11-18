// Date comune pentru repartizare și notare: elevii înscriși (cu școală, profesor) și codurile lor.
import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { CLASS_ORDER } from "./allocation";
import { DEFAULT_EDITION, DEFAULT_CONTEST_DATE } from "./roomLists";

// Codurile de anonimizare sunt salvate în colecția `codes` (un document per cod, id = codul).
// Un cod dat rămâne al elevului pentru totdeauna; elevii noi continuă numerotarea.
export const CODES_COLLECTION = "codes";

// antetul listelor (ediția, data) – reținut în browser, ca să nu fie reintrodus la fiecare deschidere
const HEADER_STORAGE_KEY = "repartizare-antet";
export const loadHeader = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(HEADER_STORAGE_KEY));
    if (saved && typeof saved === "object") {
      return { edition: DEFAULT_EDITION, date: DEFAULT_CONTEST_DATE, ...saved };
    }
  } catch {
    // fără localStorage → valorile implicite
  }
  return { edition: DEFAULT_EDITION, date: DEFAULT_CONTEST_DATE };
};
export const saveHeader = (header) => {
  try {
    localStorage.setItem(HEADER_STORAGE_KEY, JSON.stringify(header));
  } catch {
    // nu se poate salva → rămâne doar pentru sesiunea curentă
  }
};

export const normName = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

// leagă codurile salvate de elevii actuali: întâi după înscriere + nume; dacă într-o înscriere
// a rămas exact un cod nelegat și exact un elev fără cod, înseamnă că numele a fost corectat
// între timp → elevul își păstrează codul.
export const attachCodes = (students, codeDocs) => {
  const byKey = new Map();
  codeDocs.forEach((c) => byKey.set(`${c.regId}|${normName(c.nume)}`, c));
  const used = new Set();
  const result = students.map((s) => {
    const c = byKey.get(`${s.regId}|${normName(s.nume)}`);
    if (c && !used.has(c.cod)) {
      used.add(c.cod);
      return { ...s, cod: c.cod, salaCod: c.salaLaAtribuire || "" };
    }
    return s;
  });
  const freeByReg = {};
  codeDocs
    .filter((c) => !used.has(c.cod))
    .forEach((c) => (freeByReg[c.regId] = freeByReg[c.regId] || []).push(c));
  const renamed = [];
  const withoutByReg = {};
  result.forEach((s, i) => {
    if (!s.cod) (withoutByReg[s.regId] = withoutByReg[s.regId] || []).push(i);
  });
  Object.entries(withoutByReg).forEach(([regId, idxs]) => {
    const free = freeByReg[regId] || [];
    if (idxs.length === 1 && free.length === 1) {
      const c = free[0];
      result[idxs[0]] = { ...result[idxs[0]], cod: c.cod, salaCod: c.salaLaAtribuire || "" };
      used.add(c.cod);
      renamed.push({ cod: c.cod, nume: result[idxs[0]].nume });
    }
  });
  const orphans = codeDocs.filter((c) => !used.has(c.cod));
  return { students: result, renamed, orphans };
};

// toți elevii înscriși, sortați pe clasă + nume, cu codurile atașate
export const loadContestStudents = async () => {
  const schoolsSnap = await getDocs(collection(db, "schools"));
  const schoolsMap = {};
  schoolsSnap.forEach((d) => {
    schoolsMap[d.id] = d.data().name || "Școală Necunoscută";
  });

  const regsSnap = await getDocs(collection(db, "registration"));
  const students = [];
  regsSnap.forEach((d) => {
    const data = d.data();
    const list = Array.isArray(data.students) ? data.students : [];
    const clasa = data.class ? data.class.trim() : "";
    const scoala = schoolsMap[data.schoolId] || "Școală Necunoscută";
    list.forEach((student) => {
      const nume = typeof student === "string" ? student : student?.nume || "";
      if (nume) {
        students.push({
          nume,
          clasa,
          scoala,
          profesor: data.profesorIndrumatorEmail || "",
          id: `${d.id}-${nume}`,
          regId: d.id,
        });
      }
    });
  });

  students.sort((a, b) => {
    const ca = CLASS_ORDER.indexOf(a.clasa);
    const cb = CLASS_ORDER.indexOf(b.clasa);
    if (ca !== cb) return ca - cb;
    return a.nume.localeCompare(b.nume, "ro", { sensitivity: "base" });
  });

  let codeDocs = [];
  let codesError = null;
  try {
    const codesSnap = await getDocs(collection(db, CODES_COLLECTION));
    codeDocs = codesSnap.docs.map((d) => ({ cod: d.id, ...d.data() }));
  } catch (err) {
    console.error("Eroare la citirea codurilor:", err);
    codesError = err;
  }

  const attached = attachCodes(students, codeDocs);
  if (attached.renamed.length > 0) {
    // numele corectate se actualizează și în borderoul salvat
    try {
      const batch = writeBatch(db);
      attached.renamed.forEach(({ cod, nume }) =>
        batch.update(doc(db, CODES_COLLECTION, cod), { nume })
      );
      await batch.commit();
    } catch (err) {
      console.error("Eroare la actualizarea numelor în coduri:", err);
    }
  }

  return {
    students: attached.students,
    orphans: attached.orphans,
    lastCodeN: codeDocs.reduce((m, c) => Math.max(m, c.n || 0), 0),
    codesError,
  };
};
