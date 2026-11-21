// Borderouri individuale de corectare: pe fiecare clasă și pe fiecare subiect (I, II, III),
// câte un rând pentru fiecare lucrare a unui elev PREZENT (codul de anonimizare + loc pentru punctaj).
// Absenții (bifați la Notare) nu apar; elevii veniți pe loc apar cu codul lor.
import { ORGANIZER, editionLine, escapeHtml, openPrintWindow } from "./roomLists";

export const SUBJECT_NAMES = ["I", "II", "III"];
const ROWS_PER_COLUMN = 40; // 2 coloane × 40 = 80 de lucrări pe o pagină A4

const CLASS_COLOR = {
  "a IV-a": ["#5b21b6", "#a855f7"],
  "a V-a": ["#1e40af", "#3b82f6"],
  "a VI-a": ["#c2410c", "#fb923c"],
  "a VII-a": ["#047857", "#34d399"],
};

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
  `<table><thead><tr><th class="nr">Nr.</th><th class="cod">Cod lucrare</th><th class="pct">Punctaj</th></tr></thead><tbody>${rows
    .map(
      (s, i) =>
        `<tr><td class="nr">${start + i + 1}.</td><td class="cod">${escapeHtml(s.cod || "")}</td><td class="pct"></td></tr>`
    )
    .join("")}</tbody></table>`;

const pageHtml = ({ clasa, subject, papers, pageNo, pages, edition }) => {
  const [c1, c2] = CLASS_COLOR[clasa] || ["#334155", "#64748b"];
  const offset = (pageNo - 1) * ROWS_PER_COLUMN * 2;
  const cols = chunk(papers, ROWS_PER_COLUMN);
  return `<section class="page">
<div class="band" style="background:linear-gradient(135deg,${c1},${c2})">
<div class="t1">Concursul Regional „Misterele Matematicii”</div>
<div class="t2">${escapeHtml(edition)}</div>
<div class="org">${escapeHtml(ORGANIZER)}</div>
</div>
<div class="titles">
<div class="doc">BORDEROU INDIVIDUAL</div>
<div class="meta"><span class="pill" style="background:${c1}">Clasa ${escapeHtml(clasa)}</span><span class="pill subj">SUBIECTUL ${subject}</span>${
    pages > 1 ? `<span class="pill part">fila ${pageNo} din ${pages}</span>` : ""
  }</div>
</div>
<div class="cols${cols.length > 1 ? " two" : ""}">${cols.map((rows, i) => tableHtml(rows, offset + i * ROWS_PER_COLUMN)).join("")}</div>
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
.band { color: #fff; text-align: center; border-radius: 8px; padding: 7px 10px; }
.band .t1 { font-weight: bold; font-size: 13.5pt; }
.band .t2 { font-weight: bold; font-size: 11.5pt; margin-top: 1px; }
.band .org { font-style: italic; font-size: 9.5pt; opacity: .92; }
.titles { text-align: center; margin: 7px 0 6px; }
.doc { font-weight: bold; font-size: 15pt; letter-spacing: 3px; }
.meta { margin-top: 4px; display: flex; gap: 6px; justify-content: center; }
.pill { color: #fff; font-weight: bold; font-size: 11pt; padding: 2px 12px; border-radius: 999px; }
.pill.subj { background: #111827; letter-spacing: 1px; }
.pill.part { background: #6b7280; font-weight: normal; }
.cols { display: flex; justify-content: center; gap: 14mm; flex: 1; align-items: flex-start; }
table { border-collapse: collapse; width: 72mm; font-size: 11pt; }
th, td { border: 1px solid #000; height: 5.45mm; padding: 0 4px; text-align: center; }
th { background: #e5e7eb; font-size: 10pt; height: 6.5mm; }
td.nr { width: 14mm; } td.cod { width: 28mm; font-weight: bold; font-family: Calibri, Arial, sans-serif; letter-spacing: .3px; }
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
