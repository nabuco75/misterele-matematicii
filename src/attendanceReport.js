// Raport de prezență: pe clase, pe săli, pe școli + lista absenților și a elevilor veniți pe loc.
// Prezența vine din bifele „absent” de la Notare; elevii veniți pe loc din jurnalul înlocuirilor.
import XLSX from "xlsx-js-style";
import * as FileSaver from "file-saver";
import { CLASS_ORDER } from "./allocation";
import { CONTEST_TITLE, ORGANIZER, editionLine, escapeHtml, openPrintWindow } from "./roomLists";
import { displayName } from "./nameFormat";

const classRank = (c) => {
  const i = CLASS_ORDER.indexOf(c);
  return i === -1 ? CLASS_ORDER.length : i;
};
const pct = (part, total) => (total ? `${Math.round((part / total) * 1000) / 10}%`.replace(".", ",") : "—");

const tally = (list, keyOf) => {
  const map = new Map();
  list.forEach((s) => {
    const k = keyOf(s) || "—";
    if (!map.has(k)) map.set(k, { key: k, total: 0, absenti: 0, veniti: 0 });
    const t = map.get(k);
    t.total++;
    if (s.absent) t.absenti++;
    if (s.walkIn) t.veniti++;
  });
  return [...map.values()].map((t) => ({ ...t, prezenti: t.total - t.absenti }));
};

// students: elevii repartizați, cu { absent, walkIn } deja marcați; rooms: în ordinea sălilor
export const buildAttendance = (students, rooms) => {
  const total = students.length;
  const absenti = students.filter((s) => s.absent).length;
  const veniti = students.filter((s) => s.walkIn).length;
  const roomOrder = new Map(rooms.map((r, i) => [r.name, i]));
  const byNameRo = (a, b) => a.localeCompare(b, "ro", { sensitivity: "base" });
  return {
    total,
    prezenti: total - absenti,
    absenti,
    veniti,
    byClass: tally(students, (s) => s.clasa).sort((a, b) => classRank(a.key) - classRank(b.key)),
    byRoom: tally(students, (s) => s.sala).sort(
      (a, b) => (roomOrder.get(a.key) ?? 999) - (roomOrder.get(b.key) ?? 999)
    ),
    bySchool: tally(students, (s) => s.scoala).sort((a, b) => byNameRo(a.key, b.key)),
    absentList: students
      .filter((s) => s.absent)
      .sort(
        (a, b) =>
          (roomOrder.get(a.sala) ?? 999) - (roomOrder.get(b.sala) ?? 999) ||
          classRank(a.clasa) - classRank(b.clasa) ||
          byNameRo(a.nume, b.nume)
      ),
    walkInList: students.filter((s) => s.walkIn),
    // toți elevii, pe clase (alfabetic), cu starea fiecăruia
    classLists: [...new Set(students.map((s) => s.clasa))]
      .sort((a, b) => classRank(a) - classRank(b))
      .map((clasa) => ({
        clasa,
        students: students.filter((s) => s.clasa === clasa).sort((a, b) => byNameRo(a.nume, b.nume)),
      })),
  };
};

const stamp = () =>
  new Date().toLocaleString("ro-RO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

// ====== PDF ======
const table = (head, rows, leftCols = []) =>
  `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr${r.cls ? ` class="${r.cls}"` : ""}>${r.cells
          .map((c, i) => `<td${leftCols.includes(i) ? ' class="l"' : ""}>${c}</td>`)
          .join("")}</tr>`
    )
    .join("")}</tbody></table>`;

const tallyRows = (list, label, totals) => [
  ...list.map((t) => ({
    cells: [escapeHtml(label(t.key)), t.total, `<b>${t.prezenti}</b>`, t.absenti || "—", t.veniti || "—", pct(t.prezenti, t.total)],
  })),
  {
    cls: "tot",
    cells: ["TOTAL", totals.total, totals.prezenti, totals.absenti, totals.veniti, pct(totals.prezenti, totals.total)],
  },
];
const TALLY_HEAD = (first) => [first, "Repartizați", "Prezenți", "Absenți", "Veniți pe loc", "Prezență"];

// pe fiecare clasă: câți au venit, lista absenților și a celor veniți pe loc
const classSections = (report) =>
  report.classLists
    .map(({ clasa, students }) => {
      const abs = students.filter((s) => s.absent);
      const walk = students.filter((s) => s.walkIn);
      const pres = students.length - abs.length;
      return `<section class="cls"><h3>Clasa ${escapeHtml(clasa)} — ${pres} prezenți din ${students.length} (${pct(pres, students.length)}) · ${abs.length} ${abs.length === 1 ? "absent" : "absenți"}${walk.length ? ` · ${walk.length} ${walk.length === 1 ? "venit pe loc" : "veniți pe loc"}` : ""}</h3>${
        abs.length
          ? table(
              ["Nr.", "Cod", "Elev absent", "Sala", "Școala", "Profesor îndrumător"],
              abs.map((s, i) => ({
                cells: [i + 1, escapeHtml(s.cod || "—"), escapeHtml(displayName(s.nume)), escapeHtml(s.sala), escapeHtml(s.scoala), escapeHtml(displayName(s.profesor))],
              })),
              [2, 4]
            )
          : `<p class="note">Toți elevii prezenți.</p>`
      }${
        walk.length
          ? `<p class="note"><b>Veniți pe loc:</b> ${walk
              .map((s) => `${escapeHtml(s.cod || "")} ${escapeHtml(displayName(s.nume))} (${escapeHtml(s.sala)}${s.inLocul ? `, în locul lui ${escapeHtml(s.inLocul.cod)}` : ""})`)
              .join("; ")}</p>`
          : ""
      }</section>`;
    })
    .join("");

export const printAttendancePdf = (report, header) => {
  const edition = editionLine(header);
  const html = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Raport de prezență</title><style>
@page { size: A4 portrait; margin: 12mm; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
body { font-family: Calibri, "Segoe UI", Arial, sans-serif; color: #000; margin: 0; font-size: 10.5pt; }
.head { text-align: center; border: 1px solid #000; padding: 8px; background: #dbeafe; }
.head h1 { font-size: 14pt; margin: 0; } .head .ed { font-weight: bold; margin-top: 2px; } .head .org { font-style: italic; font-size: 9.5pt; }
h2 { font-size: 13pt; text-align: center; margin: 12px 0 6px; letter-spacing: 1px; }
h3 { font-size: 11pt; margin: 14px 0 4px; border-bottom: 2px solid #1e3a8a; color: #1e3a8a; }
.kpis { display: flex; gap: 8px; margin: 8px 0; }
.kpi { flex: 1; border: 1px solid #000; text-align: center; padding: 6px; }
.kpi b { display: block; font-size: 18pt; } .kpi.ok { background: #dcfce7; } .kpi.abs { background: #fee2e2; } .kpi.walk { background: #fef9c3; }
table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #000; padding: 3px 5px; text-align: center; }
th { background: #e5e7eb; font-size: 9.5pt; } td.l { text-align: left; } tr.tot td { font-weight: bold; background: #f3f4f6; }
tr { break-inside: avoid; } .note { font-size: 9pt; color: #374151; margin-top: 4px; }
.sign { margin-top: 30px; display: flex; justify-content: space-between; }
.toolbar { position: sticky; top: 0; background: #2c3e50; color: #fff; padding: 10px; text-align: center; font-family: Arial; }
.toolbar button { font-size: 15px; padding: 8px 18px; margin-left: 10px; cursor: pointer; }
@media screen { body { background: #e5e7eb; } .sheet { width: 190mm; margin: 12px auto; background: #fff; padding: 10mm; } }
@media print { .toolbar { display: none; } }
</style></head><body>
<div class="toolbar">La „Destinație” alegeți <b>Salvează ca PDF</b> (sau imprimanta).<button onclick="window.print()">🖨️ Printează / Salvează ca PDF</button></div>
<div class="sheet">
<div class="head"><h1>${escapeHtml(CONTEST_TITLE)}</h1>${edition ? `<div class="ed">${escapeHtml(edition)}</div>` : ""}<div class="org">${escapeHtml(ORGANIZER)}</div></div>
<h2>RAPORT DE PREZENȚĂ</h2>
<div class="note" style="text-align:center">Situația la ${escapeHtml(stamp())}</div>
<div class="kpis">
<div class="kpi">Repartizați<b>${report.total}</b></div>
<div class="kpi ok">Prezenți<b>${report.prezenti}</b>${pct(report.prezenti, report.total)}</div>
<div class="kpi abs">Absenți<b>${report.absenti}</b>${pct(report.absenti, report.total)}</div>
<div class="kpi walk">Veniți pe loc<b>${report.veniti}</b>(incluși la prezenți)</div>
</div>
<h3>Sumar pe clase</h3>
${table(TALLY_HEAD("Clasa"), tallyRows(report.byClass, (k) => `Clasa ${k}`, report))}
${classSections(report)}
<div class="sign"><span>Președinte comisie: ____________________</span><span>Secretar: ____________________</span></div>
</div></body></html>`;
  openPrintWindow(html, "Raport_prezenta");
};

// ====== EXCEL ======
const border = { style: "thin", color: { rgb: "000000" } };
const st = (fill, { bold = false, left = false, size = 11 } = {}) => ({
  font: { name: "Calibri", sz: size, bold },
  fill: { patternType: "solid", fgColor: { rgb: fill } },
  alignment: { horizontal: left ? "left" : "center", vertical: "center", wrapText: true },
  border: { top: border, bottom: border, left: border, right: border },
});

const sheet = (title, header, head, rows, widths, leftCols = []) => {
  const data = [[CONTEST_TITLE], [`${editionLine(header)} — ${title}`], head, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const n = head.length;
  ws["!merges"] = [0, 1].map((r) => ({ s: { r, c: 0 }, e: { r, c: n - 1 } }));
  ws["!cols"] = widths.map((wch) => ({ wch }));
  data.forEach((row, r) => {
    for (let c = 0; c < n; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      const isTotal = r > 2 && row[0] === "TOTAL";
      ws[ref].s =
        r < 2
          ? st("DBEAFE", { bold: true, size: r === 0 ? 13 : 11 })
          : r === 2
          ? st("E5E7EB", { bold: true })
          : st(isTotal ? "F3F4F6" : "FFFFFF", { bold: isTotal, left: leftCols.includes(c) });
    }
  });
  return ws;
};

const tallyData = (list, label, totals) => [
  ...list.map((t) => [label(t.key), t.total, t.prezenti, t.absenti, t.veniti, pct(t.prezenti, t.total)]),
  ["TOTAL", totals.total, totals.prezenti, totals.absenti, totals.veniti, pct(totals.prezenti, totals.total)],
];

export const exportAttendanceExcel = (report, header) => {
  const wb = XLSX.utils.book_new();
  const W = [36, 12, 11, 10, 13, 11];
  XLSX.utils.book_append_sheet(
    wb,
    sheet("Raport de prezență pe clase", header, TALLY_HEAD("Clasa"), tallyData(report.byClass, (k) => `Clasa ${k}`, report), W),
    "Pe clase"
  );
  report.classLists.forEach(({ clasa, students }) => {
    XLSX.utils.book_append_sheet(
      wb,
      sheet(
        `Prezența — clasa ${clasa}`,
        header,
        ["Nr.", "Cod", "Numele și prenumele", "Sala", "Școala", "Prezență"],
        students.map((s, i) => [
          i + 1,
          s.cod || "",
          displayName(s.nume),
          s.sala,
          s.scoala,
          s.absent ? "ABSENT" : s.walkIn ? "prezent (venit pe loc)" : "prezent",
        ]),
        [6, 12, 34, 12, 50, 22],
        [2, 4]
      ),
      `Clasa ${clasa}`.slice(0, 31)
    );
  });
  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  FileSaver.saveAs(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8" }),
    `Raport_prezenta_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
};
