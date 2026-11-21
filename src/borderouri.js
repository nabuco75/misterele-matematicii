// Borderouri individuale de corectare: pe fiecare clasă și pe fiecare subiect (I, II, III),
// câte un rând numerotat pentru fiecare lucrare a unui elev PREZENT, cu loc pentru punctaj.
// Fără coduri: evaluatorii nu au acces la anonimizare (numărul de pe borderou se trece pe lucrare).
// Absenții (bifați la Notare) nu se numără; elevii veniți pe loc da.
import { ORGANIZER, editionLine, escapeHtml, openPrintWindow } from "./roomLists";

export const SUBJECT_NAMES = ["I", "II", "III"];
const ROWS_PER_COLUMN = 40; // 2 coloane × 40 = 80 de lucrări pe o pagină A4

const CLASS_COLOR = {
  "a IV-a": ["#5b21b6", "#a855f7"],
  "a V-a": ["#1e40af", "#3b82f6"],
  "a VI-a": ["#c2410c", "#fb923c"],
  "a VII-a": ["#047857", "#34d399"],
};

// culori deschise ale clasei (capul de tabel) și culorile subiectelor
const CLASS_TINT = { "a IV-a": "#f3e8ff", "a V-a": "#dbeafe", "a VI-a": "#ffedd5", "a VII-a": "#d1fae5" };
const SUBJECT_COLOR = {
  I: { c: "#be123c", tint: "#fff1f2" },
  II: { c: "#b45309", tint: "#fffbeb" },
  III: { c: "#0f766e", tint: "#f0fdfa" },
};
// simboluri matematice discrete în banda de antet
const MATH_DECOR = [
  ["π", 3, 8], ["Σ", 12, 55], ["√", 22, 15], ["∞", 78, 12], ["÷", 87, 58], ["×", 94, 18], ["%", 70, 62], ["∫", 31, 62],
]
  .map(([ch, x, y]) => `<span class="m" style="left:${x}%;top:${y}%">${ch}</span>`)
  .join("");

const codeNumber = (cod) => parseInt(String(cod || "").replace(/\D+/g, ""), 10) || 0;

// lucrările unei clase: elevii prezenți, în ordinea codurilor
export const papersOfClass = (students, clasa) =>
  students
    .filter((s) => s.clasa === clasa && !s.absent)
    .sort((a, b) => codeNumber(a.cod) - codeNumber(b.cod) || a.nume.localeCompare(b.nume, "ro"));

const chunk = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out.length ? out : [[]];
};

const tableHtml = (rows, start) =>
  `<table><thead><tr><th class="nr">Nr. lucrare</th><th class="pct">Punctaj</th></tr></thead><tbody>${rows
    .map((_, i) => `<tr><td class="nr">${start + i + 1}.</td><td class="pct"></td></tr>`)
    .join("")}</tbody></table>`;

const pageHtml = ({ clasa, subject, papers, pageNo, pages, edition }) => {
  const [c1, c2] = CLASS_COLOR[clasa] || ["#334155", "#64748b"];
  const tint = CLASS_TINT[clasa] || "#e5e7eb";
  const sc = SUBJECT_COLOR[subject] || { c: "#334155", tint: "#f8fafc" };
  const offset = (pageNo - 1) * ROWS_PER_COLUMN * 2;
  const cols = chunk(papers, ROWS_PER_COLUMN);
  return `<section class="page">
<div class="band" style="background:linear-gradient(135deg,${c1},${c2})">${MATH_DECOR}
<div class="t1">Concursul Regional „Misterele Matematicii”</div>
<div class="t2">${escapeHtml(edition)}</div>
<div class="org">${escapeHtml(ORGANIZER)}</div>
</div>
<div class="titles">
<div class="side"><span class="pill" style="background:linear-gradient(135deg,${c1},${c2})">Clasa ${escapeHtml(clasa)}</span>${
    pages > 1 ? `<span class="part">fila ${pageNo} din ${pages}</span>` : ""
  }</div>
<div class="doc">Borderou individual<div class="rule" style="background:linear-gradient(90deg,transparent,${c1},${sc.c},transparent)"></div></div>
<div class="side right"><span class="subj" style="color:${sc.c};border-color:${sc.c};background:${sc.tint}"><small>SUBIECTUL</small><b>${subject}</b></span></div>
</div>
<div class="cols${cols.length > 1 ? " two" : ""}" style="--th:${tint};--thc:${c1}">${cols.map((rows, i) => tableHtml(rows, offset + i * ROWS_PER_COLUMN)).join("")}</div>
<div class="foot">
<div>Lucrări: <b>${papers.length}</b>${pages > 1 ? " pe această filă" : ""}</div>
<div class="sign"><span>Profesor evaluator: ______________________________</span><span>Semnătura: ________________</span></div>
</div>
</section>`;
};

// classes: [{ clasa, papers }] ; subjects: ["I","II","III"]
export const printBorderouri = ({ classes, subjects, header, fileLabel }) => {
  const edition = editionLine(header);
  const pages = [];
  classes.forEach(({ clasa, papers }) =>
    subjects.forEach((subject) => {
      const parts = chunk(papers, ROWS_PER_COLUMN * 2);
      parts.forEach((part, i) => pages.push(pageHtml({ clasa, subject, papers: part, pageNo: i + 1, pages: parts.length, edition })));
    })
  );

  const html = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Borderouri individuale${
    edition ? ` - ${escapeHtml(edition)}` : ""
  }</title><style>
@page { size: A4 portrait; margin: 10mm; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
body { font-family: "Times New Roman", Times, serif; color: #000; margin: 0; }
.page { height: 276mm; overflow: hidden; display: flex; flex-direction: column; break-after: page; page-break-after: always; }
.page:last-child { break-after: auto; page-break-after: auto; }
.band { position: relative; overflow: hidden; color: #fff; text-align: center; border-radius: 10px; padding: 7px 10px; }
.band .m { position: absolute; font-size: 20pt; font-weight: bold; color: rgba(255,255,255,.18); transform: translate(-50%, -50%) rotate(-12deg); }
.band > div { position: relative; }
.band .t1 { font-weight: bold; font-size: 13.5pt; }
.band .t2 { font-weight: bold; font-size: 11.5pt; margin-top: 1px; }
.band .org { font-style: italic; font-size: 9.5pt; opacity: .92; }
.titles { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; margin: 6px 4mm 6px; }
.side { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; }
.side.right { align-items: flex-end; }
.doc { text-align: center; font-weight: bold; font-size: 17pt; font-variant: small-caps; letter-spacing: 2px; }
.rule { height: 3px; border-radius: 3px; margin: 3px auto 0; width: 80%; }
.pill { color: #fff; font-weight: bold; font-size: 12pt; padding: 3px 14px; border-radius: 999px; }
.part { font-size: 9.5pt; color: #4b5563; font-style: italic; padding-left: 4px; }
.subj { display: inline-flex; flex-direction: column; align-items: center; border: 2.5px solid; border-radius: 12px; padding: 2px 14px 1px; line-height: 1; }
.subj small { font-size: 8pt; font-weight: bold; letter-spacing: 2px; }
.subj b { font-size: 22pt; font-weight: 900; }
.cols { display: flex; justify-content: center; gap: 14mm; flex: 1; align-items: flex-start; }
table { border-collapse: collapse; width: 62mm; font-size: 11pt; }
th, td { border: 1px solid #000; height: 5.3mm; padding: 0 4px; text-align: center; }
th { background: var(--th); color: var(--thc); font-size: 10pt; height: 6.5mm; }
td.nr { width: 26mm; }
tbody tr:nth-child(5n) td { border-bottom: 1.6px solid #000; }
.foot { font-size: 10.5pt; margin-top: 6px; }
.sign { display: flex; justify-content: space-between; margin-top: 10px; }
.toolbar { position: sticky; top: 0; z-index: 1; background: #2c3e50; color: #fff; padding: 10px; text-align: center; font-family: Arial, sans-serif; }
.toolbar button { font-size: 15px; padding: 8px 18px; margin-left: 10px; cursor: pointer; }
@media screen { body { background: #e5e7eb; } .page { width: 190mm; margin: 12px auto; background: #fff; padding: 6mm; box-shadow: 0 2px 8px rgba(0,0,0,.2); height: 289mm; } }
@media print { .toolbar { display: none; } }
</style></head><body>
<div class="toolbar">${pages.length} ${pages.length === 1 ? "pagină" : "pagini"} — la „Destinație” alegeți <b>Salvează ca PDF</b> (sau imprimanta).
<button onclick="window.print()">🖨️ Printează / Salvează ca PDF</button></div>
${pages.join("")}
</body></html>`;
  openPrintWindow(html, fileLabel || "Borderouri_individuale");
};
