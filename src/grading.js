// Notare: punctaje pe subiecte, total, premii.
import { CLASS_ORDER } from "./allocation";
import { normName } from "./contestData";

// Notele se salvează în colecția `grades`, un document per elev: id = codul elevului (MMVS_01 ...)
// dacă are cod, altfel o cheie din înscriere + nume (se poate nota și fără coduri de anonimizare).
export const GRADES_COLLECTION = "grades";

export const nameGradeId = (s) => `elev_${s.regId}_${normName(s.nume).replace(/\//g, "-")}`;
export const gradeId = (s) => s.cod || nameGradeId(s);

// notele unui elev: cele puse pe nume (înainte de coduri), peste care se pun cele puse pe cod.
// O singură regulă pentru Notare, Prezență, Repartizare și borderouri.
export const mergedGrade = (s, gradesById) => ({
  ...(gradesById[nameGradeId(s)] || {}),
  ...((s.cod && gradesById[s.cod]) || {}),
});
export const isAbsentIn = (s, gradesById) => !!mergedGrade(s, gradesById).absent;

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
  { value: "SSMR", label: "📜 Mențiune SSMR" },
];
const AWARD_VALUES = AWARDS.map((a) => a.value);

// numele întreg al premiului, pentru liste și diplome
export const AWARD_TEXT = {
  I: "Premiul I",
  II: "Premiul II",
  III: "Premiul III",
  M1: "Mențiunea I",
  M2: "Mențiunea a II-a",
  M3: "Mențiunea a III-a",
  M: "Mențiune",
  SSMR: "Mențiune SSMR",
};
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

// punctajul maxim (suma maximă): 3 subiecte × 10 = 30
export const MAX_SUM = MAX_PER_SUBJECT * SUBJECTS.length;

// suma punctajelor, fără zecimale inutile: 27 → „27”, 25.5 → „25,5”, 24.25 → „24,25”
export const formatSuma = (v) =>
  typeof v === "number" && !Number.isNaN(v)
    ? String(Math.round(v * 100) / 100).replace(".", ",")
    : "";

// treapta sumei, pentru culoare: 20–30 verde, 15–19,99 albastru, 10–14,99 auriu, sub 10 roșu
export const sumaTier = (v) => (v >= 20 ? "top" : v >= 15 ? "good" : v >= 10 ? "mid" : "low");

// 8.5 → „8,5”
export const formatScore = (v) =>
  v === null || v === undefined || v === "" ? "" : String(v).replace(".", ",");

const isNum = (v) => typeof v === "number" && !Number.isNaN(v);

// Combină elevii cu notele și calculează suma (totalul punctajelor), starea și locul în clasă.
//   stare: „nenotat” (nicio notă), „incomplet” (lipsesc subiecte), „notat”, „absent”
// Premiul nu se calculează: e cel ales manual din listă.
export const buildResults = (students, gradesByCode) => {
  const rows = students.map((s) => {
    // notele puse pe nume (înainte de coduri) + cele puse pe cod
    const g = mergedGrade(s, gradesByCode);
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
    // suma se afișează doar când toate subiectele sunt notate (altfel „incomplet”)
    const suma = filled === SUBJECTS.length && !absent ? total : null;
    return {
      ...s,
      ...scores,
      gradeId: gradeId(s),
      total,
      suma,
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

// premiile „în ordine” (cu bani); M și SSMR sunt separate și nu se compară cu clasamentul
const RANKED_AWARDS = ["I", "II", "III", "M1", "M2", "M3"];

// Verificări înainte de diplome și bani (rows = rezultatul lui buildResults):
//  - premiu dat unui elev care nu e notat complet;
//  - doi elevi cu aceeași sumă, în aceeași clasă, cu premii diferite;
//  - un elev cu sumă mai mare are premiu mai mic (sau deloc) decât unul cu sumă mai mică.
// Întoarce o listă de mesaje (gol = totul e în regulă).
export const prizeWarnings = (rows) => {
  const out = [];
  rows
    .filter((r) => r.premiu && r.stare !== "notat")
    .forEach((r) => out.push(`${r.nume} (${r.clasa}) are ${r.premiu}, dar nu este notat complet.`));

  const awardOf = (r) => (RANKED_AWARDS.includes(r.premiu) ? RANKED_AWARDS.indexOf(r.premiu) : RANKED_AWARDS.length);
  const byClass = {};
  rows
    .filter((r) => r.stare === "notat")
    .forEach((r) => (byClass[r.clasa] = byClass[r.clasa] || []).push(r));
  Object.entries(byClass).forEach(([clasa, list]) => {
    if (!list.some((r) => RANKED_AWARDS.includes(r.premiu))) return; // premiile nu s-au dat încă
    const sorted = [...list].sort((a, b) => b.suma - a.suma);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        if (a.suma === b.suma && awardOf(a) !== awardOf(b)) {
          out.push(`Clasa ${clasa}: ${a.nume} și ${b.nume} au aceeași sumă (${formatSuma(a.suma)}), dar premii diferite.`);
        } else if (a.suma > b.suma && awardOf(a) > awardOf(b)) {
          out.push(
            `Clasa ${clasa}: ${b.nume} (${formatSuma(b.suma)}) are ${b.premiu}, dar ${a.nume} (${formatSuma(a.suma)}) are ${
              a.premiu || "niciun premiu"
            }.`
          );
        }
      }
    }
  });
  return out;
};

export const classRank = (cls) => {
  const i = CLASS_ORDER.indexOf(cls);
  return i === -1 ? CLASS_ORDER.length : i;
};

// ordinea de clasament: clasă, total descrescător (absenții și nenotații la final), nume
// (sortarea e pe suma completă: un elev notat incomplet nu trece înaintea celor notați complet)
export const compareRanking = (a, b) =>
  classRank(a.clasa) - classRank(b.clasa) ||
  (b.suma ?? -1) - (a.suma ?? -1) ||
  (b.total ?? -1) - (a.total ?? -1) ||
  a.nume.localeCompare(b.nume, "ro", { sensitivity: "base" });
