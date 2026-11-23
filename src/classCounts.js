// Contorul locurilor ocupate: classCounts/{schoolId} = { IV, V, VI, VII, seq }
//
// De ce există: formularul public trebuie să știe câți elevi are deja școala la fiecare
// clasă (limita de 5), dar NU are voie să citească înscrierile (numele copiilor, emailurile
// profesorilor). Contorul conține doar numere, deci poate fi public.
//
// Înscrierea publică se face într-o tranzacție: contorul crește cu exact câți elevi se
// înscriu, `seq` crește cu 1, iar fiecare înscriere primește ID-ul `{schoolId}_{seq}_{clasă}`.
// Regulile Firestore verifică legătura dintre contor și înscrieri (vezi firestore.rules),
// așa că limita de 5 se aplică pe server, nu doar în browser.
//
// Orice modificare făcută de admin (ștergere, mutare, editare, înscriere suplimentară)
// trebuie urmată de rebuildClassCounts(), care recalculează contoarele din înscrieri.
import {
  collection,
  doc,
  getDocs,
  runTransaction,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

export const COUNTS_COLLECTION = "classCounts";

// "a IV-a" → "IV" (cheia din contor și din ID-ul înscrierii)
export const CLASS_KEYS = {
  "a IV-a": "IV",
  "a V-a": "V",
  "a VI-a": "VI",
  "a VII-a": "VII",
};
export const CLASS_NAMES = Object.keys(CLASS_KEYS);
export const MAX_PER_CLASS = 5;

const emptyCounts = () => ({ IV: 0, V: 0, VI: 0, VII: 0, seq: 0 });

// "abc_3_VI" → 3 (înscrierile publice au seq în ID); altfel 0
const seqFromRegId = (id) => {
  const m = /_(\d+)_(IV|V|VI|VII)$/.exec(id || "");
  return m ? Number(m[1]) : 0;
};

// contorul unei școli, din documentul citit (lipsă → zero)
export const countsFromDoc = (data) => {
  const c = emptyCounts();
  if (!data) return c;
  for (const k of Object.keys(c)) {
    const v = data[k];
    if (Number.isInteger(v) && v >= 0) c[k] = v;
  }
  return c;
};

// { "a IV-a": n, ... } pentru afișare
export const countsByClassName = (counts) =>
  Object.fromEntries(CLASS_NAMES.map((c) => [c, counts[CLASS_KEYS[c]] || 0]));

/**
 * Înscriere publică (profesor): totul sau nimic, cu limita verificată pe date proaspete.
 * byClass: { "a V-a": ["Pop Ana", ...], ... } (doar clasele cu elevi)
 * fields: { school, profesorIndrumatorEmail, profesorEmail, telefon }
 * Aruncă Error("LIMIT", { left, className }) dacă se depășește limita.
 */
export async function registerWithCounts(args) {
  // Doi profesori de la aceeași școală trimit în aceeași clipă: regulile îl refuză pe al
  // doilea (contorul s-a schimbat între citire și scriere). Reîncercăm cu date proaspete,
  // ca să primească mesajul corect („mai sunt X locuri”) sau să treacă, dacă e loc.
  for (let attempt = 1; ; attempt++) {
    try {
      return await registerOnce(args);
    } catch (err) {
      if (err?.code !== "permission-denied" || attempt >= 3) throw err;
    }
  }
}

async function registerOnce({ schoolId, unlimited, byClass, fields }) {
  const counterRef = doc(db, COUNTS_COLLECTION, schoolId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const before = countsFromDoc(snap.exists() ? snap.data() : null);
    const after = { ...before, seq: before.seq + 1 };

    for (const [className, students] of Object.entries(byClass)) {
      const k = CLASS_KEYS[className];
      after[k] = before[k] + students.length;
      if (!unlimited && after[k] > MAX_PER_CLASS) {
        const err = new Error("LIMIT");
        err.className = className;
        err.left = Math.max(0, MAX_PER_CLASS - before[k]);
        throw err;
      }
    }

    tx.set(counterRef, after);
    const createdAt = Date.now();
    for (const [className, students] of Object.entries(byClass)) {
      const id = `${schoolId}_${after.seq}_${CLASS_KEYS[className]}`;
      tx.set(doc(db, "registration", id), {
        class: className,
        schoolId,
        students,
        createdAt,
        ...fields,
      });
    }
    return after;
  });
}

// Școlile care până acum erau „fără limită” după nume (regula veche din formular).
// Se folosește o singură dată, ca să le marcăm cu vip: true în baza de date.
export const legacyVipByName = (schoolName) => {
  const t = String(schoolName || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
  return (
    (t.includes("stefancelmare") && t.includes("vaslui")) ||
    (t.includes("georgetutoveanu") && t.includes("barlad")) ||
    (t.includes("constantinparfene") && t.includes("vaslui"))
  );
};

/**
 * Întreținere la deschiderea panoului de admin:
 * - școlile VIP vechi (după nume) primesc vip: true, dacă nu au deloc câmpul vip;
 * - contoarele se recalculează din înscrieri.
 * schools: lista [{ id, name, vip }] deja citită.
 */
export async function adminMaintenance(schools) {
  const toMark = schools.filter((s) => s.vip === undefined && legacyVipByName(s.name));
  if (toMark.length) {
    const batch = writeBatch(db);
    toMark.forEach((s) => batch.update(doc(db, "schools", s.id), { vip: true }));
    await batch.commit();
  }
  const counters = await rebuildClassCounts();
  return { vipMarked: toMark.length, counters };
}

/**
 * Recalculează contoarele tuturor școlilor din înscrieri (doar admin).
 * Scrie numai ce s-a schimbat. `seq` nu scade niciodată (ID-urile rămân unice).
 * Întoarce numărul de contoare actualizate.
 */
export async function rebuildClassCounts() {
  const [regsSnap, countsSnap] = await Promise.all([
    getDocs(collection(db, "registration")),
    getDocs(collection(db, COUNTS_COLLECTION)),
  ]);

  const existing = new Map(countsSnap.docs.map((d) => [d.id, countsFromDoc(d.data())]));
  const next = new Map();
  for (const id of existing.keys()) next.set(id, { ...emptyCounts(), seq: existing.get(id).seq });

  regsSnap.forEach((d) => {
    const data = d.data();
    const schoolId = data.schoolId;
    const k = CLASS_KEYS[data.class];
    if (!schoolId) return;
    if (!next.has(schoolId)) next.set(schoolId, emptyCounts());
    const c = next.get(schoolId);
    if (k) c[k] += Array.isArray(data.students) ? data.students.length : 0;
    c.seq = Math.max(c.seq, seqFromRegId(d.id));
  });

  const changed = [...next.entries()].filter(([id, c]) => {
    const old = existing.get(id);
    return !old || Object.keys(c).some((k) => c[k] !== old[k]);
  });

  for (let i = 0; i < changed.length; i += 400) {
    const batch = writeBatch(db);
    changed.slice(i, i + 400).forEach(([id, c]) => batch.set(doc(db, COUNTS_COLLECTION, id), c));
    await batch.commit();
  }
  return changed.length;
}
