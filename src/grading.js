// Notare: punctaje pe subiecte, total, premii.
import { CLASS_ORDER } from "./allocation";
import { normName } from "./contestData";

// Notele se salvează în colecția `grades`, un document per elev: id = codul elevului (MMVS_01 ...)
// dacă are cod, altfel o cheie din înscriere + nume (se poate nota și fără coduri de anonimizare).
export const GRADES_COLLECTION = "grades";

export const nameGradeId = (s) => `elev_${s.regId}_${normName(s.nume).replace(/\//g, "-")}`;
export const gradeId = (s) => s.cod || nameGradeId(s);

export const SUBJECTS = [
  { key: "s1", label: "Sub. I" },
  { key: "s2", label: "Sub. II" },
  { key: "s3", label: "Sub. III" },
];
export const MAX_PER_SUBJECT = 10;

// premiile se aleg manual, din listă (se salvează în câmpul `premiu` al notei)
export const AWARDS = [
  { value: "I", label: "🥇 I" },
  { value: "II", label: "🥈 II" },
  { value: "III", label: "🥉 III" },
  { value: "M1", label: "🏅 M1" },
  { value: "M2", label: "🎖️ M2" },
  { value: "M3", label: "🎗️ M3" },
  { value: "M", label: "⭐ M" },
];
const AWARD_VALUES = AWARDS.map((a) => a.value);
const AWARD_RANK = Object.fromEntries(AWARD_VALUES.map((a, i) => [a, i + 1]));
export const awardRank = (a) => AWARD_RANK[a] || 99;

// „8,5” sau „8.5” → 8.5; gol → null; altceva → eroare
export const parseScore = (raw) => {
  const text = String(raw ?? "").trim().replace(",", ".");
  if (text === "") return { value: null };
  if (!/^\d+(\.\d+)?$/.test(text)) return { error: "Doar cifre (ex. 8,5)" };
  const value = Number(text);
  if (value < 0 || value > MAX_PER_SUBJECT) return { error: `Între 0 și ${MAX_PER_SUBJECT}` };
  return { value: Math.round(value * 100) / 100 };
};

// media mereu cu 2 zecimale: 8 → „8,00”, 7.6667 → „7,67”
export const formatMedia = (v) =>
  typeof v === "number" && !Number.isNaN(v) ? v.toFixed(2).replace(".", ",") : "";

// treapta mediei, pentru culoare: ≥ 9, ≥ 7, ≥ 5, sub 5
export const mediaTier = (v) => (v >= 9 ? "top" : v >= 7 ? "good" : v >= 5 ? "mid" : "low");

// 8.5 → „8,5”
export const formatScore = (v) =>
  v === null || v === undefined || v === "" ? "" : String(v).replace(".", ",");

const isNum = (v) => typeof v === "number" && !Number.isNaN(v);

// Combină elevii cu notele și calculează totalul, media, starea și locul în clasă.
//   stare: „nenotat” (nicio notă), „incomplet” (lipsesc subiecte), „notat”, „absent”
// Premiul nu se calculează: e cel ales manual din listă.
export const buildResults = (students, gradesByCode) => {
  const rows = students.map((s) => {
    // notele puse pe nume (înainte de coduri) + cele puse pe cod
    const g = { ...(gradesByCode[nameGradeId(s)] || {}), ...((s.cod && gradesByCode[s.cod]) || {}) };
    const scores = Object.fromEntries(SUBJECTS.map(({ key }) => [key, isNum(g[key]) ? g[key] : null]));
    const filled = SUBJECTS.filter(({ key }) => scores[key] !== null).length;
    const absent = !!g.absent;
    let stare;
    if (absent) stare = "absent";
    else if (filled === 0) stare = "nenotat";
    else if (filled < SUBJECTS.length) stare = "incomplet";
    else stare = "notat";
    const total =
      filled > 0 && !absent
        ? Math.round(SUBJECTS.reduce((sum, { key }) => sum + (scores[key] || 0), 0) * 100) / 100
        : null;
    const media = filled === SUBJECTS.length && !absent ? Math.round((total / SUBJECTS.length) * 100) / 100 : null;
    return {
      ...s,
      ...scores,
      gradeId: gradeId(s),
      total,
      media,
      absent,
      stare,
      premiu: !absent && AWARD_VALUES.includes(g.premiu) ? g.premiu : "",
      loc: null,
    };
  });

  // locul în clasament, pe clase
  const byClass = {};
  rows.forEach((r) => {
    if (r.stare === "notat") (byClass[r.clasa] = byClass[r.clasa] || []).push(r);
  });
  Object.values(byClass).forEach((list) => {
    list.forEach((r) => {
      // locul în clasament (cu egalitate: 1, 2, 2, 4 ...)
      r.loc = list.filter((o) => o.total > r.total).length + 1;
    });
  });

  return rows;
};

export const classRank = (cls) => {
  const i = CLASS_ORDER.indexOf(cls);
  return i === -1 ? CLASS_ORDER.length : i;
};

// ordinea de clasament: clasă, total descrescător (absenții și nenotații la final), nume
export const compareRanking = (a, b) =>
  classRank(a.clasa) - classRank(b.clasa) ||
  (b.total ?? -1) - (a.total ?? -1) ||
  a.nume.localeCompare(b.nume, "ro", { sensitivity: "base" });
