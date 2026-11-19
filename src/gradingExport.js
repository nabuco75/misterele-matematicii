// Export rezultate (Excel + PDF) – exact rândurile afișate (filtrate și ordonate), cu coloanele alese.
import XLSX from "xlsx-js-style";
import * as FileSaver from "file-saver";
import { CONTEST_TITLE, ORGANIZER, editionLine, escapeHtml, openPrintWindow } from "./roomLists";
import { SUBJECTS, formatScore, formatSuma, classRank } from "./grading";
import { displayName } from "./nameFormat";

// toate coloanele posibile; `numeric` → celulă număr în Excel (se poate sorta/calcula)
export const EXPORT_COLUMNS = [
  { key: "nr", label: "Nr. crt.", wch: 7 },
  { key: "loc", label: "Locul", wch: 7, numeric: true },
  { key: "cod", label: "Cod", wch: 12, bold: true },
  { key: "nume", label: "Numele și prenumele", wch: 30, left: true },
  { key: "clasa", label: "Clasa", wch: 9 },
  ...SUBJECTS.map((s) => ({ key: s.key, label: s.label, wch: 8, numeric: true })),
  { key: "suma", label: "Suma", wch: 8, numeric: true, bold: true },
  { key: "premiu", label: "Premiul", wch: 9, bold: true },
  { key: "scoala", label: "Numele școlii participante", wch: 40 },
  { key: "profesor", label: "Profesor îndrumător", wch: 28 },
  { key: "sala", label: "Sala", wch: 10 },
];

const cellValue = (row, key, index) => {
  if (key === "nr") return index + 1;
  if (key === "sala") return row.salaCod || "";
  if (key === "suma") return row.absent ? "absent" : row.suma;
  // numele apar uniform („Popescu Ana-Maria”), oricum au fost scrise la înscriere
  if (key === "nume" || key === "profesor") return displayName(row[key]);
  if (row.absent && SUBJECTS.some((s) => s.key === key)) return "";
  return row[key] ?? "";
};

// împarte pe clase (în ordinea claselor), păstrând ordinea rândurilor din fiecare clasă
const splitGroups = (rows, byClass) => {
  if (!byClass) return [{ clasa: null, rows }];
  const map = new Map();
  rows.forEach((r) => {
    if (!map.has(r.clasa)) map.set(r.clasa, []);
    map.get(r.clasa).push(r);
  });
  return [...map.entries()]
    .sort(([a], [b]) => classRank(a) - classRank(b))
    .map(([clasa, list]) => ({ clasa, rows: list }));
};

const titleLine = (header) =>
  [CONTEST_TITLE, editionLine(header)].filter(Boolean).join(", ").toUpperCase();
const groupLine = (clasa, subtitle) =>
  [clasa ? `CLASA ${clasa.toUpperCase()}` : "", subtitle ? subtitle.toUpperCase() : ""]
    .filter(Boolean)
    .join(" — ") || "REZULTATE";

const fileStamp = () => new Date().toISOString().slice(0, 10);
const safeName = (s) => s.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "_");

// ====== EXCEL ======
const thin = { style: "thin", color: { rgb: "000000" } };
const style = ({ fill = "FFFFFF", bold = false, size = 11, left = false } = {}) => ({
  font: { name: "Calibri", sz: size, bold },
  fill: { patternType: "solid", fgColor: { rgb: fill } },
  alignment: { horizontal: left ? "left" : "center", vertical: "center", wrapText: true },
  border: { top: thin, bottom: thin, left: thin, right: thin },
});

export const exportResultsExcel = (rows, { columns, byClass, header, subtitle, fileLabel }) => {
  const cols = EXPORT_COLUMNS.filter((c) => columns.includes(c.key));
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set();

  splitGroups(rows, byClass).forEach(({ clasa, rows: list }) => {
    const data = [
      [titleLine(header), ...cols.slice(1).map(() => "")],
      [groupLine(clasa, subtitle), ...cols.slice(1).map(() => "")],
      cols.map((c) => c.label),
      ...list.map((r, i) => cols.map((c) => cellValue(r, c.key, i))),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const last = cols.length - 1;
    ws["!merges"] = [0, 1].map((r) => ({ s: { r, c: 0 }, e: { r, c: last } }));
    ws["!cols"] = cols.map((c) => ({ wch: c.wch }));
    ws["!rows"] = [{ hpt: 30 }, { hpt: 22 }, { hpt: 30 }, ...list.map(() => ({ hpt: 28 }))];

    data.forEach((row, r) =>
      row.forEach((_, c) => {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (!ws[ref]) ws[ref] = { t: "s", v: "" };
        const col = cols[c];
        if (r === 0) ws[ref].s = style({ bold: true, size: 13 });
        else if (r === 1) ws[ref].s = style({ fill: "D9D9D9", bold: true, size: 12 });
        else if (r === 2) ws[ref].s = style({ fill: "D6DCE4", bold: true });
        else {
          ws[ref].s = style({
            fill: (r - 3) % 2 ? "F2F2F2" : "FFFFFF",
            bold: !!col.bold,
            left: !!col.left,
          });
        }
      })
    );

    let name = (clasa ? `Clasa ${clasa}` : "Rezultate").replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
    let n = 2;
    while (usedNames.has(name)) name = `${name.slice(0, 28)} ${n++}`;
    usedNames.add(name);
    XLSX.utils.book_append_sheet(workbook, ws, name);
  });

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  FileSaver.saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8",
    }),
    `${safeName(fileLabel || "Rezultate")}_${fileStamp()}.xlsx`
  );
};

// ====== PDF (fereastra de printare → „Salvează ca PDF”) ======
export const printResultsPdf = (rows, { columns, byClass, header, subtitle, fileLabel }) => {
  const cols = EXPORT_COLUMNS.filter((c) => columns.includes(c.key));
  const landscape = cols.length >= 9;
  const fmt = (v, key) =>
    typeof v === "number" ? (key === "suma" ? formatSuma(v) : formatScore(v)) : escapeHtml(v);

  const pages = splitGroups(rows, byClass)
    .map(
      ({ clasa, rows: list }) => `<section class="page">
<table>
<thead>
<tr><th colspan="${cols.length}" class="title">${escapeHtml(CONTEST_TITLE)}
${editionLine(header) ? `<div class="edition">${escapeHtml(editionLine(header))}</div>` : ""}
<div class="org">${escapeHtml(ORGANIZER)}</div></th></tr>
<tr><th colspan="${cols.length}" class="group">${escapeHtml(groupLine(clasa, subtitle))}</th></tr>
<tr class="head">${cols.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}</tr>
</thead>
<tbody>${list
        .map(
          (r, i) =>
            `<tr>${cols
              .map(
                (c) =>
                  `<td class="${[c.bold && "b", c.left && "l"].filter(Boolean).join(" ")}">${fmt(
                    cellValue(r, c.key, i),
                    c.key
                  )}</td>`
              )
              .join("")}</tr>`
        )
        .join("")}</tbody>
</table>
<p class="total">Total: ${list.length} elevi</p>
</section>`
    )
    .join("");

  const html = `<!doctype html><html lang="ro"><head><meta charset="utf-8">
<title>${escapeHtml(fileLabel || "Rezultate")}</title>
<style>
@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 10mm; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
body { font-family: Calibri, "Segoe UI", Arial, sans-serif; margin: 0; color: #000; }
.page { break-after: page; page-break-after: always; }
.page:last-child { break-after: auto; page-break-after: auto; }
table { width: 100%; border-collapse: collapse; font-size: 10.5pt; line-height: 1.2; }
th, td { border: 1px solid #000; padding: 3px 5px; text-align: center; vertical-align: middle; }
th.title { background: #fff; font-size: 13pt; padding: 6px; }
.edition { font-size: 11.5pt; margin-top: 3px; }
.org { font-size: 10pt; font-weight: normal; font-style: italic; margin-top: 2px; }
th.group { background: #1F3864; color: #fff; font-size: 13pt; padding: 5px; letter-spacing: 0.5px; }
tr.head th { background: #D6DCE4; font-size: 10pt; }
tbody tr:nth-child(even) { background: #F2F2F2; }
td.b { font-weight: bold; } td.l { text-align: left; }
tr { break-inside: avoid; page-break-inside: avoid; }
.total { font-size: 10pt; margin: 6px 2px 0; }
.toolbar { position: sticky; top: 0; background: #2c3e50; color: #fff; padding: 10px; text-align: center; font-family: Arial, sans-serif; }
.toolbar button { font-size: 15px; padding: 8px 18px; margin-left: 10px; cursor: pointer; }
@media print { .toolbar { display: none; } }
</style></head><body>
<div class="toolbar">La „Destinație” alegeți <b>Salvează ca PDF</b> (sau imprimanta).
<button onclick="window.print()">🖨️ Printează / Salvează ca PDF</button></div>
${pages}
</body></html>`;

  openPrintWindow(html, safeName(fileLabel || "Rezultate"));
};
