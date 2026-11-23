// Tabelul premiilor în bani acordate de Asociația „Arcașii lui Ștefan”:
// premianții (I, II, III, M1, M2, M3) cu suma de primit și loc de semnătură.
// Mențiunile SSMR (și „M” simplu) nu primesc bani de la asociație, deci nu apar.
import XLSX from "xlsx-js-style";
import * as FileSaver from "file-saver";
import { ORGANIZER, editionLine, escapeHtml, openPrintWindow } from "./roomLists";
import { awardRank, classRank } from "./grading";
import { displayName } from "./nameFormat";
import { AMOUNTS_STORAGE_KEY, saveSetting } from "./settings";

export const SPONSOR = "Asociația „Arcașii lui Ștefan”";

// sumele implicite; organizatorul le poate schimba din „Notare” (dropdown pe fiecare premiu)
export const PRIZE_AMOUNTS = { I: 300, II: 200, III: 100, M1: 50, M2: 40, M3: 30 };
export const PRIZE_KEYS = Object.keys(PRIZE_AMOUNTS);
// valorile propuse în dropdown (lei); 0 = premiul nu primește bani
export const PRIZE_PRESETS = [0, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 100, 120, 150, 200, 250, 300, 350, 400, 500, 1000];
export const MAX_PRIZE = 100000;

const cleanAmount = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= MAX_PRIZE ? n : null;
};
// sumele salvate (config/settings, cu copie în browser), completate cu cele implicite
export const loadPrizeAmounts = () => {
  const out = { ...PRIZE_AMOUNTS };
  try {
    const saved = JSON.parse(localStorage.getItem(AMOUNTS_STORAGE_KEY));
    if (saved && typeof saved === "object") {
      PRIZE_KEYS.forEach((k) => {
        const n = cleanAmount(saved[k]);
        if (n !== null) out[k] = n;
      });
    }
  } catch {
    // fără localStorage → valorile implicite
  }
  return out;
};
export const savePrizeAmounts = (amounts) => saveSetting("prizeAmounts", amounts);
export const normalizePrizeAmount = cleanAmount;
export const isDefaultAmounts = (amounts) => PRIZE_KEYS.every((k) => amounts[k] === PRIZE_AMOUNTS[k]);

export const PRIZE_LABEL = {
  I: "Premiul I",
  II: "Premiul II",
  III: "Premiul III",
  M1: "Mențiunea I",
  M2: "Mențiunea a II-a",
  M3: "Mențiunea a III-a",
};
const PRIZE_COLOR = {
  I: ["#b45309", "#fef3c7"],
  II: ["#475569", "#f1f5f9"],
  III: ["#9a3412", "#ffedd5"],
  M1: ["#1d4ed8", "#dbeafe"],
  M2: ["#0f766e", "#ccfbf1"],
  M3: ["#7c3aed", "#ede9fe"],
};
const PRIZE_ICON = { I: "🥇", II: "🥈", III: "🥉", M1: "🏅", M2: "🎖️", M3: "🎗️" };
const PRIZE_ORDER = PRIZE_KEYS;

export const lei = (n) => `${n.toLocaleString("ro-RO")} lei`;

// premianții cu bani, pe clase, apoi după premiu, sumă (desc.) și nume
// (un premiu cu suma 0 nu apare în tabel)
export const prizeRows = (rows, amounts = PRIZE_AMOUNTS) =>
  rows
    .filter((r) => !r.absent && amounts[r.premiu] > 0)
    .map((r) => ({
      ...r,
      nume: displayName(r.nume),
      bani: amounts[r.premiu],
      premiuText: PRIZE_LABEL[r.premiu],
    }))
    .sort(
      (a, b) =>
        classRank(a.clasa) - classRank(b.clasa) ||
        awardRank(a.premiu) - awardRank(b.premiu) ||
        (b.suma ?? -1) - (a.suma ?? -1) ||
        a.nume.localeCompare(b.nume, "ro", { sensitivity: "base" })
    );

export const prizeSummary = (list, amounts = PRIZE_AMOUNTS) => {
  const byPrize = PRIZE_ORDER.map((p) => {
    const count = list.filter((r) => r.premiu === p).length;
    return { premiu: p, label: PRIZE_LABEL[p], amount: amounts[p], count, total: count * amounts[p] };
  });
  return { byPrize, count: list.length, total: list.reduce((n, r) => n + r.bani, 0) };
};

// premianții împărțiți pe clase, cu totalul fiecărei clase
export const prizeClasses = (list) => {
  const map = new Map();
  list.forEach((r) => {
    if (!map.has(r.clasa)) map.set(r.clasa, []);
    map.get(r.clasa).push(r);
  });
  return [...map.entries()].map(([clasa, rows]) => ({ clasa, rows, total: rows.reduce((n, r) => n + r.bani, 0) }));
};

const stamp = () => new Date().toISOString().slice(0, 10);

// ====== PDF ======
export const printPrizesPdf = (rows, header, amounts = PRIZE_AMOUNTS) => {
  const list = prizeRows(rows, amounts);
  const sum = prizeSummary(list, amounts);
  const edition = editionLine(header);

  const classes = prizeClasses(list);
  let nr = 0;
  const body = classes
    .map(
      ({ clasa, rows: cr, total }) =>
        `<tr class="cls"><td colspan="6">Clasa ${escapeHtml(clasa)}</td></tr>${cr
          .map((r) => {
            const [c, tint] = PRIZE_COLOR[r.premiu];
            nr += 1;
            return `<tr>
<td class="nr">${nr}.</td>
<td class="name">${escapeHtml(r.nume)}</td>
<td class="school">${escapeHtml(r.scoala)}</td>
<td><span class="prize" style="color:${c};background:${tint};border-color:${c}">${escapeHtml(r.premiuText)}</span></td>
<td class="money">${lei(r.bani)}</td>
<td class="sign"></td>
</tr>`;
          })
          .join("")}<tr class="sub"><td colspan="4">Total clasa ${escapeHtml(clasa)} (${cr.length} ${
          cr.length === 1 ? "premiant" : "premianți"
        })</td><td class="money">${lei(total)}</td><td></td></tr>`
    )
    .join("");
  const classRows = classes
    .map((g) => `<tr><td class="l">Clasa ${escapeHtml(g.clasa)}</td><td>${g.rows.length}</td><td class="money">${lei(g.total)}</td></tr>`)
    .join("");

  const summaryRows = sum.byPrize
    .filter((p) => p.count > 0)
    .map(
      (p) => `<tr><td class="l">${PRIZE_ICON[p.premiu]} ${p.label}</td><td>${p.count}</td><td>${lei(
        p.amount
      )}</td><td class="money">${lei(p.total)}</td></tr>`
    )
    .join("");

  const html = `<!doctype html><html lang="ro"><head><meta charset="utf-8">
<title>Premii în bani${edition ? ` - ${escapeHtml(edition)}` : ""}</title>
<style>
@page { size: A4 portrait; margin: 10mm 10mm 12mm; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
body { font-family: "Times New Roman", Times, serif; color: #000; margin: 0; }
.doc { max-width: 190mm; margin: 0 auto; }
.band { position: relative; overflow: hidden; color: #fff; text-align: center; border-radius: 12px; padding: 10px 14px 11px;
  background: radial-gradient(circle at 8% 0%, rgba(251,191,36,.55) 0%, transparent 40%), linear-gradient(135deg, #7f1d1d, #b91c1c 45%, #1e3a8a); }
.band .m { position: absolute; font-size: 22pt; font-weight: bold; color: rgba(255,255,255,.15); transform: translate(-50%,-50%) rotate(-12deg); }
.band > div { position: relative; }
.band .sp { font-size: 10pt; letter-spacing: 2px; text-transform: uppercase; opacity: .95; }
.band .t1 { font-weight: bold; font-size: 14pt; margin-top: 2px; }
.band .t2 { font-weight: bold; font-size: 11.5pt; }
.band .org { font-style: italic; font-size: 9.5pt; opacity: .92; }
h1 { text-align: center; font-size: 17pt; font-variant: small-caps; letter-spacing: 2px; margin: 12px 0 2px; }
.lead { text-align: center; font-size: 11pt; margin: 0 8mm 4px; line-height: 1.35; }
.rule { height: 3px; width: 60%; margin: 6px auto 10px; border-radius: 3px; background: linear-gradient(90deg, transparent, #b91c1c, #f59e0b, #1e3a8a, transparent); }
table { width: 100%; border-collapse: collapse; }
table.main { font-size: 10.5pt; table-layout: fixed; }
table.main th, table.main td { border: 1px solid #000; padding: 3px 5px; text-align: center; vertical-align: middle; }
table.main thead th { background: #1e3a8a; color: #fff; font-size: 9.5pt; height: 9mm; }
table.main tbody td { height: 10mm; }
table.main tr { break-inside: avoid; page-break-inside: avoid; }
tr.cls td { height: auto !important; background: #fef3c7; color: #7f1d1d; font-weight: bold; text-align: left; letter-spacing: 1px; padding: 3px 8px; }
table.main td.name { text-align: left; font-weight: bold; padding-left: 7px; } table.main td.school { text-align: left; font-size: 9.5pt; line-height: 1.15; }
td.money { font-weight: bold; white-space: nowrap; }
.prize { display: inline-block; border: 1.5px solid; border-radius: 999px; padding: 0 7px; font-size: 9pt; font-weight: bold; white-space: nowrap; }
tr.sub td { height: 8mm !important; background: #fef3c7; color: #7f1d1d; font-weight: bold; text-align: right; }
tr.sub td.money { text-align: center; font-size: 11.5pt; }
tr.total td { background: #fee2e2; font-weight: bold; font-size: 11.5pt; height: 9mm; }
.sumbox { display: flex; gap: 10mm; margin-top: 8mm; align-items: flex-start; break-inside: avoid; page-break-inside: avoid; }
.sumcol { display: flex; flex-direction: column; gap: 5mm; }
table.sum { width: 105mm; font-size: 10.5pt; }
table.sum th, table.sum td { border: 1px solid #000; padding: 3px 6px; text-align: center; }
table.sum th { background: #fef3c7; color: #7f1d1d; }
table.sum td.l { text-align: left; }
table.sum tr.t td { background: #1e3a8a; color: #fff; font-weight: bold; }
.big { flex: 1; text-align: center; border: 2px solid #b91c1c; border-radius: 14px; padding: 10px; }
.big small { display: block; font-size: 10pt; letter-spacing: 1px; text-transform: uppercase; color: #7f1d1d; }
.big b { display: block; font-size: 24pt; color: #b91c1c; }
.big span { font-size: 10pt; }
.signs { display: flex; justify-content: space-between; margin-top: 12mm; font-size: 11pt; text-align: center; break-inside: avoid; page-break-inside: avoid; }
.signs div { width: 30%; display: flex; flex-direction: column; } .signs i { display: block; margin-top: auto; padding-top: 12mm; border-bottom: 1px dotted #000; }
.toolbar { position: sticky; top: 0; z-index: 1; background: #2c3e50; color: #fff; padding: 10px; text-align: center; font-family: Arial, sans-serif; }
.toolbar button { font-size: 15px; padding: 8px 18px; margin-left: 10px; cursor: pointer; }
@media screen { body { background: #e5e7eb; } .doc { background: #fff; padding: 8mm; margin: 12px auto; box-shadow: 0 2px 8px rgba(0,0,0,.2); } }
@media print { .toolbar { display: none; } }
</style></head><body>
<div class="toolbar">${list.length} premianți · ${lei(sum.total)} — la „Destinație” alegeți <b>Salvează ca PDF</b> (sau imprimanta).
<button onclick="window.print()">🖨️ Printează / Salvează ca PDF</button></div>
<div class="doc">
<div class="band">${[
    ["π", 4, 30], ["Σ", 14, 75], ["√", 88, 25], ["∞", 95, 75], ["%", 76, 80], ["÷", 24, 20],
  ]
    .map(([ch, x, y]) => `<span class="m" style="left:${x}%;top:${y}%">${ch}</span>`)
    .join("")}
<div class="sp">${escapeHtml(SPONSOR)}</div>
<div class="t1">Concursul Regional de Matematică „Misterele Matematicii”</div>
<div class="t2">${escapeHtml(edition)}</div>
<div class="org">${escapeHtml(ORGANIZER)}</div>
</div>
<h1>Tabel nominal</h1>
<p class="lead">cu elevii premiați la Concursul Regional de Matematică „Misterele Matematicii”${
    header?.edition ? `, ediția ${escapeHtml(header.edition)}` : ""
  }${header?.date ? `, ${escapeHtml(header.date)}` : ""},<br>care au primit premii în bani din partea <b>${escapeHtml(SPONSOR)}</b></p>
<div class="rule"></div>
<table class="main">
<colgroup><col style="width:10mm"><col style="width:46mm"><col><col style="width:30mm"><col style="width:19mm"><col style="width:30mm"></colgroup>
<thead><tr><th>Nr. crt.</th><th>Numele și prenumele elevului</th><th>Școala</th><th>Premiul</th><th>Suma</th><th>Semnătura</th></tr></thead>
<tbody>${body}
<tr class="total"><td colspan="4" style="text-align:right">TOTAL (${list.length} premianți)</td><td class="money">${lei(sum.total)}</td><td></td></tr>
</tbody></table>
<div class="sumbox">
<div class="sumcol">
<table class="sum"><thead><tr><th>Premiul</th><th>Elevi</th><th>Suma / elev</th><th>Total</th></tr></thead>
<tbody>${summaryRows}<tr class="t"><td class="l">Total</td><td>${list.length}</td><td></td><td>${lei(sum.total)}</td></tr></tbody></table>
<table class="sum"><thead><tr><th>Pe clase</th><th>Premianți</th><th>Total</th></tr></thead>
<tbody>${classRows}<tr class="t"><td class="l">Total</td><td>${list.length}</td><td>${lei(sum.total)}</td></tr></tbody></table>
</div>
<div class="big"><small>Total premii acordate</small><b>${lei(sum.total)}</b><span>${list.length} elevi premiați</span></div>
</div>
<div class="signs">
<div>Președinte,<br>${escapeHtml(SPONSOR)}<i></i></div>
<div>Director,<br>${escapeHtml(ORGANIZER)}<i></i></div>
<div>Întocmit,<br>&nbsp;<i></i></div>
</div>
</div>
</body></html>`;
  openPrintWindow(html, "Premii_in_bani");
};

// ====== EXCEL ======
const thin = { style: "thin", color: { rgb: "000000" } };
const st = ({ fill = "FFFFFF", bold = false, size = 11, left = false, color = "000000" } = {}) => ({
  font: { name: "Calibri", sz: size, bold, color: { rgb: color } },
  fill: { patternType: "solid", fgColor: { rgb: fill } },
  alignment: { horizontal: left ? "left" : "center", vertical: "center", wrapText: true },
  border: { top: thin, bottom: thin, left: thin, right: thin },
});

export const exportPrizesExcel = (rows, header, amounts = PRIZE_AMOUNTS) => {
  const list = prizeRows(rows, amounts);
  const sum = prizeSummary(list, amounts);
  const N = 7;
  const blank = Array(N - 1).fill("");
  const data = [
    [SPONSOR.toUpperCase(), ...blank],
    ["Concursul Regional de Matematică „Misterele Matematicii”", ...blank],
    [`${editionLine(header)} · ${ORGANIZER}`, ...blank],
    ["TABEL NOMINAL CU ELEVII PREMIAȚI — PREMII ÎN BANI", ...blank],
    ["Nr. crt.", "Numele și prenumele elevului", "Clasa", "Școala", "Premiul", "Suma (lei)", "Semnătura"],
  ];
  const HEAD = 5;
  const subRows = new Set();
  let nr = 0;
  prizeClasses(list).forEach(({ clasa, rows: cr, total }) => {
    cr.forEach((r) => data.push([++nr, r.nume, r.clasa, r.scoala, r.premiuText, r.bani, ""]));
    subRows.add(data.length);
    data.push(["", `Total clasa ${clasa} (${cr.length} ${cr.length === 1 ? "premiant" : "premianți"})`, "", "", "", total, ""]);
  });
  const totalRow = data.length;
  data.push(["", "", "", "", "TOTAL", sum.total, ""]);
  data.push(Array(N).fill(""));
  const sumHead = data.length;
  data.push(["", "Premiul", "Elevi", "Suma / elev (lei)", "Total (lei)", "", ""]);
  const used = sum.byPrize.filter((p) => p.count > 0);
  used.forEach((p) => data.push(["", p.label, p.count, p.amount, p.total, "", ""]));
  data.push(["", "Total", list.length, "", sum.total, "", ""]);
  const sumEnd = data.length - 1;

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!merges"] = [
    ...[0, 1, 2, 3].map((r) => ({ s: { r, c: 0 }, e: { r, c: N - 1 } })),
    ...[...subRows].map((r) => ({ s: { r, c: 1 }, e: { r, c: 4 } })),
  ];
  ws["!cols"] = [{ wch: 7 }, { wch: 30 }, { wch: 9 }, { wch: 40 }, { wch: 17 }, { wch: 11 }, { wch: 20 }];
  ws["!rows"] = data.map((_, r) => ({ hpt: r < 4 ? 22 : r === 4 ? 30 : r > HEAD - 1 && r < totalRow ? 30 : 20 }));
  data.forEach((row, r) =>
    row.forEach((_, c) => {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      if (r === 0) ws[ref].s = st({ fill: "7F1D1D", bold: true, size: 12, color: "FFFFFF" });
      else if (r === 1) ws[ref].s = st({ fill: "B91C1C", bold: true, size: 14, color: "FFFFFF" });
      else if (r === 2) ws[ref].s = st({ fill: "1E3A8A", size: 11, color: "FFFFFF" });
      else if (r === 3) ws[ref].s = st({ fill: "FEF3C7", bold: true, size: 13, color: "7F1D1D" });
      else if (r === 4) ws[ref].s = st({ fill: "1E3A8A", bold: true, color: "FFFFFF" });
      else if (subRows.has(r)) {
        ws[ref].s = st({ fill: "FEF3C7", bold: true, color: "7F1D1D", left: c === 1 });
        if (c === 5) ws[ref].z = '#,##0 "lei"';
      } else if (r < totalRow) {
        ws[ref].s = st({ fill: (r - HEAD) % 2 ? "F8FAFC" : "FFFFFF", bold: c === 1 || c === 5, left: c === 1 || c === 3 });
        if (c === 5) ws[ref].z = '#,##0 "lei"';
      } else if (r === totalRow) {
        ws[ref].s = st({ fill: "FEE2E2", bold: true, size: 12 });
        if (c === 5) ws[ref].z = '#,##0 "lei"';
      } else if (r >= sumHead && r <= sumEnd && c >= 1 && c <= 4) {
        ws[ref].s =
          r === sumHead
            ? st({ fill: "FEF3C7", bold: true, color: "7F1D1D" })
            : r === sumEnd
            ? st({ fill: "1E3A8A", bold: true, color: "FFFFFF" })
            : st({ left: c === 1 });
      } else ws[ref].s = { font: { name: "Calibri", sz: 11 } };
    })
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Premii in bani");
  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  FileSaver.saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8",
    }),
    `Premii_in_bani_${stamp()}.xlsx`
  );
};
