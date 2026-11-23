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
export const buildAttendance = (students, rooms, { registered = null, registeredTotal = null } = {}) => {
  const total = students.length;
  const absenti = students.filter((s) => s.absent).length;
  const veniti = students.filter((s) => s.walkIn).length;
  const roomOrder = new Map(rooms.map((r, i) => [r.name, i]));
  const byNameRo = (a, b) => a.localeCompare(b, "ro", { sensitivity: "base" });
  return {
    registered,
    registeredTotal,
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

const TALLY_HEAD = (first) => [first, "Repartizați", "Prezenți", "Absenți", "Veniți pe loc", "Prezență"];

// pe fiecare clasă: câți au venit, lista absenților și a celor veniți pe loc
const classSections = (report) =>
  report.classLists
    .map(({ clasa, students }) => {
      const abs = students.filter((s) => s.absent);
      const walk = students.filter((s) => s.walkIn);
      const pres = students.length - abs.length;
      const [c1, c2] = CLASS_COLOR[clasa] || ["#475569", "#64748b"];
      return `<section class="cls"><h4 style="background:linear-gradient(90deg,${c1},${c2})">Clasa ${escapeHtml(clasa)} — ${pres} prezenți din ${students.length} (${pct(pres, students.length)}) · ${abs.length} ${abs.length === 1 ? "absent" : "absenți"}${walk.length ? ` · ${walk.length} ${walk.length === 1 ? "venit pe loc" : "veniți pe loc"}` : ""}</h4>${
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

const CLASS_COLOR = {
  "a IV-a": ["#5b21b6", "#a855f7"],
  "a V-a": ["#1e40af", "#3b82f6"],
  "a VI-a": ["#c2410c", "#fb923c"],
  "a VII-a": ["#047857", "#34d399"],
};
const ROMAN = { "a IV-a": "IV", "a V-a": "V", "a VI-a": "VI", "a VII-a": "VII" };

export const printAttendancePdf = (report, header) => {
  const edition = editionLine(header);
  const reg = report.registered || {};
  const regTotal = report.registeredTotal ?? report.total;
  const p = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  const classCards = report.byClass
    .map((t) => {
      const [c1, c2] = CLASS_COLOR[t.key] || ["#475569", "#64748b"];
      const v = p(t.prezenti, t.total);
      return `<div class="ccard" style="background:linear-gradient(135deg,${c1},${c2})">
<span class="roman">${ROMAN[t.key] || ""}</span>
<div class="cname">Clasa ${escapeHtml(t.key)}</div>
<div class="cbig"><b>${t.prezenti}</b> prezenți</div>
<div class="cbar"><div style="width:${v}%"></div></div>
<div class="crow"><span>Înscriși <b>${reg[t.key] ?? t.total}</b></span><span>Absenți <b>${t.absenti}</b></span><span>Prezență <b>${pct(t.prezenti, t.total)}</b></span></div>
${t.veniti ? `<div class="cwalk">+ ${t.veniti} ${t.veniti === 1 ? "venit" : "veniți"} pe loc</div>` : ""}
</div>`;
    })
    .join("");

  const html = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Raport de prezență${edition ? ` - ${escapeHtml(edition)}` : ""}</title><style>
@page { size: A4 portrait; margin: 10mm; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
body { font-family: Calibri, "Segoe UI", Arial, sans-serif; color: #0f172a; margin: 0; font-size: 10.5pt; }
.band { border-radius: 10px; padding: 14px 18px; color: #fff; text-align: center;
  background: radial-gradient(circle at 10% 0%, #a855f7 0%, transparent 45%), radial-gradient(circle at 95% 130%, #06b6d4 0%, transparent 45%), linear-gradient(135deg, #1e1b4b, #312e81 55%, #4c1d95); }
.band h1 { margin: 0; font-size: 15pt; letter-spacing: .5px; }
.band .ed { font-weight: bold; font-size: 11.5pt; margin-top: 3px; }
.band .org { font-style: italic; font-size: 9.5pt; opacity: .9; margin-top: 2px; }
.title { text-align: center; margin: 12px 0 2px; font-size: 17pt; font-weight: 900; letter-spacing: 3px; color: #312e81; }
.stamp { text-align: center; font-size: 9pt; color: #475569; margin-bottom: 10px; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.kpi { border-radius: 10px; color: #fff; padding: 8px 10px; }
.kpi span { display: block; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; opacity: .92; }
.kpi b { display: block; font-size: 22pt; line-height: 1.1; }
.kpi small { font-size: 8.5pt; opacity: .92; }
.k1 { background: linear-gradient(135deg, #334155, #64748b); } .k2 { background: linear-gradient(135deg, #059669, #34d399); }
.k3 { background: linear-gradient(135deg, #b91c1c, #f87171); } .k4 { background: linear-gradient(135deg, #b45309, #fbbf24); }
h3 { font-size: 11.5pt; margin: 14px 0 6px; color: #312e81; text-transform: uppercase; letter-spacing: 1.5px; border-bottom: 2px solid #c7d2fe; padding-bottom: 2px; }
.cgrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.ccard { position: relative; overflow: hidden; border-radius: 10px; color: #fff; padding: 9px 12px; break-inside: avoid; }
.roman { position: absolute; right: 8px; bottom: -14px; font-size: 44pt; font-weight: 900; color: rgba(255,255,255,.16); }
.cname { font-weight: 900; font-size: 12.5pt; }
.cbig b { font-size: 19pt; }
.cbar { height: 6px; border-radius: 9px; background: rgba(255,255,255,.3); margin: 4px 0 5px; overflow: hidden; }
.cbar div { height: 100%; background: #fff; border-radius: 9px; }
.crow { display: flex; gap: 12px; font-size: 9.5pt; position: relative; }
.cwalk { font-size: 9pt; margin-top: 2px; position: relative; }
table { width: 100%; border-collapse: collapse; margin-top: 2px; }
th, td { border: 1px solid #94a3b8; padding: 3px 5px; text-align: center; font-size: 9.5pt; }
th { background: #e0e7ff; color: #1e1b4b; } td.l { text-align: left; } tr.tot td { font-weight: bold; background: #eef2ff; }
tbody tr:nth-child(even) td { background: #f8fafc; }
tr { break-inside: avoid; }
section.cls h4 { margin: 10px 0 3px; font-size: 10.5pt; padding: 3px 8px; border-radius: 6px; color: #fff; }
.note { font-size: 9pt; color: #334155; margin: 3px 0; }
.sign { margin-top: 28px; display: flex; justify-content: space-between; font-size: 10.5pt; }
.toolbar { position: sticky; top: 0; z-index: 1; background: #2c3e50; color: #fff; padding: 10px; text-align: center; font-family: Arial; }
.toolbar button { font-size: 15px; padding: 8px 18px; margin-left: 10px; cursor: pointer; }
@media screen { body { background: #e5e7eb; } .sheet { width: 190mm; margin: 12px auto; background: #fff; padding: 8mm; box-shadow: 0 2px 8px rgba(0,0,0,.2); } }
@media print { .toolbar { display: none; } }
</style></head><body>
<div class="toolbar">La „Destinație” alegeți <b>Salvează ca PDF</b> (sau imprimanta).<button onclick="window.print()">🖨️ Printează / Salvează ca PDF</button></div>
<div class="sheet">
<div class="band"><h1>${escapeHtml(CONTEST_TITLE)}</h1>${edition ? `<div class="ed">${escapeHtml(edition)}</div>` : ""}<div class="org">${escapeHtml(ORGANIZER)}</div></div>
<div class="title">RAPORT DE PREZENȚĂ</div>
<div class="stamp">Situația la ${escapeHtml(stamp())}</div>
<div class="kpis">
<div class="kpi k1"><span>Înscriși</span><b>${regTotal}</b><small>${report.total} repartizați în săli</small></div>
<div class="kpi k2"><span>Prezenți</span><b>${report.prezenti}</b><small>${pct(report.prezenti, report.total)} din repartizați</small></div>
<div class="kpi k3"><span>Absenți</span><b>${report.absenti}</b><small>${pct(report.absenti, report.total)}</small></div>
<div class="kpi k4"><span>Veniți pe loc</span><b>${report.veniti}</b><small>incluși la prezenți</small></div>
</div>
<h3>Prezența pe clase</h3>
<div class="cgrid">${classCards}</div>
<h3>Sumar</h3>
${table(
  ["Clasa", "Înscriși", "Repartizați", "Prezenți", "Absenți", "Veniți pe loc", "Prezență"],
  [
    ...report.byClass.map((t) => ({
      cells: [`Clasa ${escapeHtml(t.key)}`, reg[t.key] ?? t.total, t.total, `<b>${t.prezenti}</b>`, t.absenti || "—", t.veniti || "—", pct(t.prezenti, t.total)],
    })),
    { cls: "tot", cells: ["TOTAL", regTotal, report.total, report.prezenti, report.absenti, report.veniti, pct(report.prezenti, report.total)] },
  ]
)}
<h3>Elevii absenți, pe clase</h3>
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
