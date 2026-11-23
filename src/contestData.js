// Date comune pentru repartizare și notare: elevii înscriși (cu școală, profesor) și codurile lor.
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { CLASS_ORDER } from "./allocation";
import { DEFAULT_EDITION, DEFAULT_CONTEST_DATE } from "./roomLists";
import { HEADER_STORAGE_KEY, saveSetting } from "./settings";

// Codurile de anonimizare sunt salvate în colecția `codes` (un document per cod, id = codul).
// Un cod dat rămâne al elevului pentru totdeauna; elevii noi continuă numerotarea.
export const CODES_COLLECTION = "codes";

// antetul listelor (ediția, data) – salvat în config/settings (comun tuturor calculatoarelor),
// cu o copie în browser (vezi settings.js)
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
export const saveHeader = (header) => saveSetting("header", header);

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
export const attachCodes = (students, allCodeDocs) => {
  // codurile retrase (elev scos) nu se mai leagă de nimeni și nu se mai dau altcuiva
  const codeDocs = allCodeDocs.filter((c) => !c.retras);
  const byKey = new Map();
  codeDocs.forEach((c) => byKey.set(`${c.regId}|${normName(c.nume)}`, c));
  const used = new Set();
  const result = students.map((s) => {
    const c = byKey.get(`${s.regId}|${normName(s.nume)}`);
    if (c && !used.has(c.cod)) {
      used.add(c.cod);
      // numeAnterior: numele de pe bilețelul tipărit înainte de corectare (pentru retipărire)
      return { ...s, cod: c.cod, salaCod: c.salaLaAtribuire || "", numeAnterior: c.numeAnterior || "" };
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
      result[idxs[0]] = { ...result[idxs[0]], cod: c.cod, salaCod: c.salaLaAtribuire || "", numeAnterior: c.nume };
      used.add(c.cod);
      renamed.push({ cod: c.cod, regId, oldName: c.nume, newName: result[idxs[0]].nume });
    }
  });
  const orphans = codeDocs.filter((c) => !used.has(c.cod));
  return { students: result, renamed, orphans };
};

// același elev înscris de două ori la aceeași școală (altă clasă, alt profesor, alt moment,
// sau cu numele în ordine inversă: „Pop Ana” = „Ana Pop”). Întoarce grupurile suspecte.
export const possibleDuplicates = (students) => {
  const key = (s) => `${s.scoala}|${normName(s.nume).replace(/[^a-z ]/g, " ").split(" ").filter(Boolean).sort().join(" ")}`;
  const groups = new Map();
  students.forEach((s) => {
    const k = key(s);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  });
  return [...groups.values()].filter((g) => g.length > 1);
};

// numele școlii pentru liste: dacă localitatea nu apare deja în nume, o adăugăm
// („Școala Gimnazială „Ștefan Luchian”” → „Școala Gimnazială „Ștefan Luchian”, Moinești”)
export const schoolWithLocality = (school) => {
  const name = String(school?.name || "").trim() || "Școală Necunoscută";
  const locality = String(school?.locality || "").trim();
  if (!locality) return name;
  const plain = (s) => normName(s).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const words = ` ${plain(name)} `;
  return words.includes(` ${plain(locality)} `) ? name : `${name}, ${locality}`;
};

// toți elevii înscriși, sortați pe clasă + nume, cu codurile atașate
export const loadContestStudents = async () => {
  const schoolsSnap = await getDocs(collection(db, "schools"));
  const schoolsMap = {};
  schoolsSnap.forEach((d) => {
    schoolsMap[d.id] = schoolWithLocality(d.data());
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
    // numele corectate se actualizează în coduri, în repartizarea salvată și în notele puse pe nume
    try {
      const { applyRenames } = await import("./studentSync");
      await applyRenames(attached.renamed);
    } catch (err) {
      console.error("Eroare la actualizarea numelor corectate:", err);
    }
  }

  return {
    students: attached.students,
    orphans: attached.orphans,
    retiredCodes: codeDocs.filter((c) => c.retras),
    lastCodeN: codeDocs.reduce((m, c) => Math.max(m, c.n || 0), 0),
    codesError,
  };
};
