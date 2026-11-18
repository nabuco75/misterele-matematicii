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

// premiile automate, în ordinea punctajelor distincte (cea mai mare notă = I, a doua = II ...)
export const AUTO_AWARDS = ["I", "II", "III", "M1", "M2", "M3"];
// mențiunea simplă se bifează manual
export const MANUAL_AWARD = "M";
const AWARD_RANK = Object.fromEntries([...AUTO_AWARDS, MANUAL_AWARD].map((a, i) => [a, i + 1]));
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

// 8.5 → „8,5”
export const formatScore = (v) =>
  v === null || v === undefined || v === "" ? "" : String(v).replace(".", ",");

const isNum = (v) => typeof v === "number" && !Number.isNaN(v);

// Combină elevii cu notele și calculează totalul, starea și premiul.
//   stare: „nenotat” (nicio notă), „incomplet” (lipsesc subiecte), „notat”, „absent”
// Premiile se dau pe fiecare clasă, după punctajele distincte (egalitate = același premiu):
//   primul punctaj → I, al doilea → II, al treilea → III, apoi M1, M2, M3.
//   După M3, mențiunea simplă M se dă doar elevilor bifați manual.
//   Se calculează doar dintre elevii notați complet și prezenți.
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
      mentiune: !!g.mentiune,
      stare,
      premiu: "",
      loc: null,
    };
  });

  // premii pe clase
  const byClass = {};
  rows.forEach((r) => {
    if (r.stare === "notat") (byClass[r.clasa] = byClass[r.clasa] || []).push(r);
  });
  Object.values(byClass).forEach((list) => {
    const distinct = [...new Set(list.map((r) => r.total))].sort((a, b) => b - a);
    const place = new Map(distinct.map((t, i) => [t, i]));
    list.forEach((r) => {
      const i = place.get(r.total);
      // locul în clasament (cu egalitate: 1, 2, 2, 4 ...)
      r.loc = list.filter((o) => o.total > r.total).length + 1;
      if (i < AUTO_AWARDS.length) r.premiu = AUTO_AWARDS[i];
      else if (r.mentiune) r.premiu = MANUAL_AWARD;
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
