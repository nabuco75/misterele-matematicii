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
const cell = (v) => {
  const p = plain(v);
  if (p === null || p === undefined) return "";
  if (Array.isArray(p)) return p.map((x) => (typeof x === "object" ? JSON.stringify(x) : x)).join("; ");
  if (typeof p === "object") return JSON.stringify(p);
  return p;
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

// salvează copia: un Excel (câte o foaie pe colecție, plus elevii pe rânduri) și un JSON complet
export const downloadBackup = (data) => {
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
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(elevi), "Elevi");
  COLLECTIONS.forEach((name) => XLSX.utils.book_append_sheet(wb, sheetFrom(data.collections[name]), name));
  XLSX.utils.book_append_sheet(
    wb,
    sheetFrom(Object.entries(data.config).map(([id, v]) => ({ id, ...v }))),
    "config"
  );
  const when = stamp();
  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  FileSaver.saveAs(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8" }),
    `Copie_completa_concurs_${when}.xlsx`
  );
  FileSaver.saveAs(
    new Blob([JSON.stringify(data, null, 1)], { type: "application/json;charset=UTF-8" }),
    `Copie_completa_concurs_${when}.json`
  );
  return { elevi: elevi.length };
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
