// Listele pe săli (pentru afișare pe uși): export Excel cu antet și PDF (prin fereastra de printare).
import XLSX from "xlsx-js-style";
import * as FileSaver from "file-saver";
import { CLASS_ORDER } from "./allocation";

export const CONTEST_TITLE = "CONCURS REGIONAL DE MATEMATICĂ - MISTERELE MATEMATICII";
export const ORGANIZER = "Școala Gimnazială „Ștefan cel Mare” Vaslui";
// valorile implicite pentru antet; se pot schimba din pagina de repartizare
export const DEFAULT_EDITION = "a XX-a";
export const DEFAULT_CONTEST_DATE = "21 noiembrie 2026";

// „Ediția a XX-a - 21 noiembrie 2026”
const editionLine = ({ edition, date } = {}) =>
  [edition && `Ediția ${edition}`, date].filter(Boolean).join(" - ");

const COLUMNS = [
  "Nr. Curent",
  "Numele și Prenumele elevului",
  "Clasa",
  "Numele Școlii Participante",
  "Profesor îndrumător",
];

// culori pe clase, ca în listele din anii trecuți
export const CLASS_COLORS = {
  "a IV-a": "E4DFEC",
  "a V-a": "DCE6F1",
  "a VI-a": "F2DCDB",
  "a VII-a": "EBF1DE",
};
// Listele de pe uși: fond alb, clasa marcată doar printr-o dungă colorată la stânga
// și textul clasei colorat (culori închise, lizibile și la printare alb-negru).
const CLASS_ACCENTS = {
  "a IV-a": { strip: "7030A0", text: "5B237F" },
  "a V-a": { strip: "2E75B6", text: "1F4E79" },
  "a VI-a": { strip: "C55A11", text: "843C0C" },
  "a VII-a": { strip: "548235", text: "375623" },
};
const DEFAULT_ACCENT = { strip: "808080", text: "000000" };
const accentOf = (cls) => CLASS_ACCENTS[cls] || DEFAULT_ACCENT;
const TITLE_FILL = "FFFFFF";
const ROOM_FILL = "1F3864";
const ROOM_TEXT = "FFFFFF";
const HEADER_FILL = "D6DCE4";
const ZEBRA_FILL = "F2F2F2";

const escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const classRank = (cls) => {
  const i = CLASS_ORDER.indexOf(cls);
  return i === -1 ? CLASS_ORDER.length : i;
};

// grupează rezultatul repartizării pe săli, în ordinea sălilor, elevii pe clase + alfabetic
export const groupByRoom = (allocation, rooms) => {
  const map = {};
  allocation.forEach((item) => {
    (map[item.sala] = map[item.sala] || []).push(item);
  });
  return rooms
    .filter((room) => map[room.name])
    .map((room) => ({
      room,
      title: `${room.name}${room.floor ? ` - ${room.floor}` : ""}`.toUpperCase(),
      students: [...map[room.name]].sort(
        (a, b) =>
          classRank(a.clasa) - classRank(b.clasa) ||
          a.nume.localeCompare(b.nume, "ro", { sensitivity: "base" })
      ),
    }));
};

const classSummary = (students) => {
  const counts = {};
  students.forEach((s) => {
    counts[s.clasa] = (counts[s.clasa] || 0) + 1;
  });
  return Object.keys(counts)
    .sort((a, b) => classRank(a) - classRank(b))
    .map((cls) => `${counts[cls]} elevi clasa ${cls}`)
    .join(", ");
};

// ====== EXCEL ======
const border = {
  top: { style: "thin", color: { rgb: "000000" } },
  bottom: { style: "thin", color: { rgb: "000000" } },
  left: { style: "thin", color: { rgb: "000000" } },
  right: { style: "thin", color: { rgb: "000000" } },
};
const cellStyle = (
  fill,
  { bold = false, size = 11, align = "center", color = "000000", leftBorder = null } = {}
) => ({
  font: { name: "Calibri", sz: size, bold, color: { rgb: color } },
  fill: { patternType: "solid", fgColor: { rgb: fill } },
  alignment: { horizontal: align, vertical: "center", wrapText: true },
  border: leftBorder ? { ...border, left: leftBorder } : border,
});

// numele foii Excel: max. 31 caractere, fără caractere interzise, unic
const sheetName = (name, used) => {
  const base = name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sala";
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) candidate = `${base.slice(0, 28)} ${n++}`;
  used.add(candidate);
  return candidate;
};

export const exportRoomsExcel = (groups, header, roomName = null) => {
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set();

  groups.forEach(({ room, title, students }) => {
    const rows = [
      [CONTEST_TITLE, "", "", "", ""],
      [editionLine(header), "", "", "", ""],
      [title, "", "", "", ""],
      COLUMNS,
      ...students.map((s, i) => [i + 1, s.nume, s.clasa, s.scoala, s.profesor]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);

    ws["!merges"] = [0, 1, 2].map((r) => ({ s: { r, c: 0 }, e: { r, c: 4 } }));
    ws["!cols"] = [{ wch: 8 }, { wch: 32 }, { wch: 9 }, { wch: 42 }, { wch: 30 }];
    ws["!rows"] = [{ hpt: 28 }, { hpt: 20 }, { hpt: 24 }, { hpt: 32 }, ...students.map(() => ({ hpt: 30 }))];

    const headerStyles = [
      cellStyle(TITLE_FILL, { bold: true, size: 13 }),
      cellStyle(TITLE_FILL, { bold: true, size: 11 }),
      cellStyle(ROOM_FILL, { bold: true, size: 16, color: ROOM_TEXT }),
      cellStyle(HEADER_FILL, { bold: true }),
    ];
    for (let r = 0; r < headerStyles.length; r++) {
      for (let c = 0; c < 5; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        ws[ref] = { ...(ws[ref] || { t: "s", v: "" }), s: headerStyles[r] };
      }
    }
    students.forEach((s, i) => {
      const fill = i % 2 ? ZEBRA_FILL : "FFFFFF";
      const accent = accentOf(s.clasa);
      for (let c = 0; c < 5; c++) {
        const ref = XLSX.utils.encode_cell({ r: i + headerStyles.length, c });
        ws[ref].s = cellStyle(fill, {
          size: 12,
          align: c === 1 ? "left" : "center",
          bold: c === 2,
          color: c === 2 ? accent.text : "000000",
          leftBorder: c === 0 ? { style: "thick", color: { rgb: accent.strip } } : null,
        });
      }
    });

    XLSX.utils.book_append_sheet(workbook, ws, sheetName(room.name, usedNames));
  });

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  FileSaver.saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8",
    }),
    roomName
      ? `Lista_${roomName.replace(/\s+/g, "_")}.xlsx`
      : `Repartizare_pe_Sali_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
};

// ====== PDF (pagina de printare → „Salvează ca PDF”) ======
const buildRoomsHtml = (groups, header) => {
  const edition = editionLine(header);
  const pages = groups
    .map(({ title, students }) => {
      const rows = students
        .map(
          (s, i) => {
            const accent = accentOf(s.clasa);
            return `<tr>
<td style="border-left:6px solid #${accent.strip}">${i + 1}</td><td class="name">${escapeHtml(s.nume)}</td><td class="cls" style="color:#${accent.text}">${escapeHtml(s.clasa)}</td>
<td>${escapeHtml(s.scoala)}</td><td>${escapeHtml(s.profesor)}</td></tr>`;
          }
        )
        .join("");
      return `<section class="page">
<table>
<thead>
<tr><th colspan="5" class="title">${escapeHtml(CONTEST_TITLE)}${edition ? `<div class="edition">${escapeHtml(edition)}</div>` : ""}<div class="org">${escapeHtml(ORGANIZER)}</div></th></tr>
<tr><th colspan="5" class="room">${escapeHtml(title)}</th></tr>
<tr class="head">${COLUMNS.map((c) => `<th>${c}</th>`).join("")}</tr>
</thead>
<tbody>${rows}</tbody>
</table>
<p class="total">Total: ${students.length} elevi (${escapeHtml(classSummary(students))})</p>
</section>`;
    })
    .join("");

  return `<!doctype html><html lang="ro"><head><meta charset="utf-8">
<title>Repartizare pe săli${edition ? ` - ${escapeHtml(edition)}` : ""}</title>
<style>
@page { size: A4 portrait; margin: 10mm; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
body { font-family: Calibri, "Segoe UI", Arial, sans-serif; margin: 0; color: #000; }
.page { break-after: page; page-break-after: always; }
.page:last-child { break-after: auto; page-break-after: auto; }
table { width: 100%; border-collapse: collapse; font-size: 11pt; line-height: 1.2; }
th, td { border: 1px solid #000; padding: 3px 5px; text-align: center; vertical-align: middle; }
th.title { background: #${TITLE_FILL}; font-size: 13pt; padding: 6px; }
.edition { font-size: 11.5pt; margin-top: 3px; }
.org { font-size: 10pt; font-weight: normal; font-style: italic; margin-top: 2px; }
th.room { background: #${ROOM_FILL}; color: #${ROOM_TEXT}; font-size: 16pt; padding: 6px; letter-spacing: 1px; }
tr.head th { background: #${HEADER_FILL}; font-size: 10pt; }
tbody tr:nth-child(even) { background: #${ZEBRA_FILL}; }
td.name { text-align: left; }
td.cls { font-weight: bold; }
td:first-child { width: 7%; } td.name { width: 26%; } td:nth-child(3) { width: 8%; } td:nth-child(4) { width: 35%; }
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
};

export const printRoomsPdf = (groups, header, fileLabel = "Repartizare_pe_Sali") => {
  const html = buildRoomsHtml(groups, header);
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
    return;
  }
  // fereastra a fost blocată → descărcăm pagina ca fișier (se deschide și se printează ca PDF)
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileLabel}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
