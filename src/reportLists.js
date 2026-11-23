// Situații pentru raportare (cerute de inspectorat / parteneri), cu antetul concursului, PDF + Excel:
//  1) Rezultate: elevii prezenți, pe clase, în ordinea descrescătoare a sumei — nume, sumă, premiu, școală, profesor
//  2) Școlile participante (unice): localitate, județ, elevi înscriși / prezenți, profesori
//  3) Profesorii îndrumători (unici): nume, școală, telefon, email, elevi
import XLSX from "xlsx-js-style";
import * as FileSaver from "file-saver";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { CLASS_ORDER } from "./allocation";
import { loadContestStudents } from "./contestData";
import { GRADES_COLLECTION, buildResults, classRank, formatSuma } from "./grading";
import { ORGANIZER, editionLine, escapeHtml, openPrintWindow } from "./roomLists";
import { displayName } from "./nameFormat";
import { teacherKey } from "./teachers";

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

const CLASS_COLOR = {
  "a IV-a": ["#5b21b6", "#ede9fe"],
  "a V-a": ["#1e40af", "#dbeafe"],
  "a VI-a": ["#c2410c", "#ffedd5"],
  "a VII-a": ["#047857", "#d1fae5"],
};
const cmpRo = (a, b) => String(a || "").localeCompare(String(b || ""), "ro", { sensitivity: "base" });
const clean = (s) => String(s || "").trim().replace(/\s+/g, " ");

// ====== DATELE ======
export const loadReportData = async () => {
  const [data, gradesSnap, regsSnap, schoolsSnap] = await Promise.all([
    loadContestStudents(),
    getDocs(collection(db, GRADES_COLLECTION)),
    getDocs(collection(db, "registration")),
    getDocs(collection(db, "schools")),
  ]);
  const grades = {};
  gradesSnap.forEach((d) => (grades[d.id] = d.data()));
  const results = buildResults(data.students, grades);

  const schools = {};
  schoolsSnap.forEach((d) => {
    const x = d.data();
    schools[d.id] = { id: d.id, name: clean(x.name), locality: clean(x.locality), county: clean(x.county) };
  });
  const regs = {};
  regsSnap.forEach((d) => (regs[d.id] = d.data()));

  // 1) rezultate: doar prezenții, pe clase, suma descrescător (cei fără sumă completă la final)
  const present = results.filter((r) => !r.absent);
  const resultsByClass = [...new Set([...CLASS_ORDER, ...present.map((r) => r.clasa)])]
    .map((clasa) => ({
      clasa,
      rows: present
        .filter((r) => r.clasa === clasa)
        .sort((a, b) => (b.suma ?? -1) - (a.suma ?? -1) || cmpRo(a.nume, b.nume))
        .map((r) => ({
          nume: displayName(r.nume),
          suma: r.suma,
          premiu: AWARD_TEXT[r.premiu] || "",
          scoala: r.scoala,
          profesor: displayName(r.profesor),
        })),
    }))
    .filter((g) => g.rows.length > 0)
    .sort((a, b) => classRank(a.clasa) - classRank(b.clasa));

  // 2) școli și 3) profesori, din înscrieri (elevii înscriși), cu prezenții din note
  const presentByReg = {};
  present.forEach((r) => (presentByReg[r.regId] = (presentByReg[r.regId] || 0) + 1));
  const schoolMap = new Map();
  const teacherMap = new Map();
  Object.entries(regs).forEach(([regId, x]) => {
    const n = Array.isArray(x.students) ? x.students.filter((s) => (typeof s === "string" ? s : s?.nume)).length : 0;
    if (n === 0) return;
    const sc = schools[x.schoolId] || { id: x.schoolId || "?", name: "Școală necunoscută", locality: "", county: "" };
    if (!schoolMap.has(sc.id)) schoolMap.set(sc.id, { ...sc, inscrisi: 0, prezenti: 0, profs: new Set() });
    const s = schoolMap.get(sc.id);
    s.inscrisi += n;
    s.prezenti += presentByReg[regId] || 0;

    const nume = clean(x.profesorIndrumatorEmail);
    const tk = teacherKey(nume);
    if (!tk) return;
    s.profs.add(tk);
    const key = `${tk}|${sc.id}`;
    if (!teacherMap.has(key))
      teacherMap.set(key, {
        nume: displayName(nume),
        scoala: sc.name,
        localitate: sc.locality,
        telefon: "",
        email: "",
        elevi: 0,
      });
    const t = teacherMap.get(key);
    t.elevi += n;
    if (!t.telefon && clean(x.telefon)) t.telefon = clean(x.telefon);
    if (!t.email && clean(x.profesorEmail)) t.email = clean(x.profesorEmail).toLowerCase();
  });

  const schoolList = [...schoolMap.values()]
    .map(({ profs, ...s }) => ({ ...s, profesori: profs.size }))
    .sort((a, b) => cmpRo(a.county, b.county) || cmpRo(a.locality, b.locality) || cmpRo(a.name, b.name));
  const teacherList = [...teacherMap.values()].sort((a, b) => cmpRo(a.nume, b.nume) || cmpRo(a.scoala, b.scoala));

  return {
    resultsByClass,
    presentCount: present.length,
    incomplete: present.filter((r) => r.suma == null).length,
    absentCount: results.length - present.length,
    schools: schoolList,
    teachers: teacherList,
    localities: new Set(schoolList.map((s) => `${s.locality}|${s.county}`)).size,
    counties: new Set(schoolList.map((s) => s.county).filter(Boolean)).size,
  };
};

// ====== DEFINIȚIA LISTELOR (aceleași coloane în PDF și Excel) ======
const sumaText = (v) => (v == null ? "—" : formatSuma(v));

export const LISTS = {
  rezultate: {
    title: "Rezultatele concursului",
    file: "Rezultate_pe_clase",
    landscape: true,
    columns: [
      { label: "Nr. crt.", wch: 7, w: "11mm" },
      { label: "Numele și prenumele elevului", wch: 30, w: "58mm", left: true, bold: true },
      { label: "Suma", wch: 8, w: "15mm", bold: true },
      { label: "Premiul", wch: 17, w: "32mm" },
      { label: "Școala", wch: 42, left: true },
      { label: "Profesor îndrumător", wch: 28, w: "52mm", left: true },
    ],
    groups: (d) =>
      d.resultsByClass.map((g) => ({
        heading: `Clasa ${g.clasa}`,
        color: CLASS_COLOR[g.clasa],
        note: `${g.rows.length} elevi prezenți · în ordinea descrescătoare a punctajului`,
        rows: g.rows.map((r, i) => [i + 1, r.nume, r.suma, r.premiu, r.scoala, r.profesor]),
      })),
    format: (v, c) => (c === 2 ? sumaText(v) : v),
  },
  scoli: {
    title: "Școlile participante",
    file: "Scoli_participante",
    landscape: false,
    columns: [
      { label: "Nr. crt.", wch: 7, w: "11mm" },
      { label: "Școala", wch: 46, left: true, bold: true },
      { label: "Localitatea", wch: 18, w: "28mm" },
      { label: "Județul", wch: 12, w: "20mm" },
      { label: "Elevi înscriși", wch: 10, w: "17mm" },
      { label: "Elevi prezenți", wch: 10, w: "17mm" },
      { label: "Profesori", wch: 10, w: "17mm" },
    ],
    groups: (d) => [
      {
        heading: "",
        rows: d.schools.map((s, i) => [i + 1, s.name, s.locality, s.county, s.inscrisi, s.prezenti, s.profesori]),
        total: [
          "",
          `TOTAL: ${d.schools.length} școli`,
          `${d.localities} localități`,
          `${d.counties} județe`,
          d.schools.reduce((n, s) => n + s.inscrisi, 0),
          d.schools.reduce((n, s) => n + s.prezenti, 0),
          d.teachers.length,
        ],
      },
    ],
  },
  profesori: {
    title: "Profesorii îndrumători",
    file: "Profesori_indrumatori",
    landscape: true,
    columns: [
      { label: "Nr. crt.", wch: 7, w: "11mm" },
      { label: "Numele și prenumele", wch: 30, w: "55mm", left: true, bold: true },
      { label: "Școala", wch: 42, left: true },
      { label: "Localitatea", wch: 16, w: "28mm" },
      { label: "Telefon", wch: 14, w: "27mm" },
      { label: "Email", wch: 32, w: "62mm", left: true },
      { label: "Elevi", wch: 7, w: "13mm" },
    ],
    groups: (d) => [
      {
        heading: "",
        rows: d.teachers.map((t, i) => [i + 1, t.nume, t.scoala, t.localitate, t.telefon, t.email, t.elevi]),
        total: ["", `TOTAL: ${d.teachers.length} profesori`, "", "", "", "", d.teachers.reduce((n, t) => n + t.elevi, 0)],
      },
    ],
  },
};

const fmtCell = (list, v, c) => (list.format ? list.format(v, c) : v ?? "");

// ====== PDF ======
const MATH = [["π", 4, 30], ["Σ", 13, 75], ["√", 88, 25], ["∞", 95, 72], ["%", 77, 80], ["÷", 24, 22]]
  .map(([ch, x, y]) => `<span class="m" style="left:${x}%;top:${y}%">${ch}</span>`)
  .join("");

const listHtml = (id, data, header) => {
  const list = LISTS[id];
  const edition = editionLine(header);
  const groups = list.groups(data);
  const colgroup = `<colgroup>${list.columns.map((c) => `<col${c.w ? ` style="width:${c.w}"` : ""}>`).join("")}</colgroup>`;
  const thead = `<thead><tr>${list.columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}</tr></thead>`;
  const tables = groups
    .map((g) => {
      const [c1, tint] = g.color || ["#1e3a8a", "#e0e7ff"];
      const body = g.rows
        .map(
          (row) =>
            `<tr>${row
              .map((v, c) => {
                const col = list.columns[c];
                return `<td class="${[col.left && "l", col.bold && "b"].filter(Boolean).join(" ")}">${escapeHtml(
                  fmtCell(list, v, c)
                )}</td>`;
              })
              .join("")}</tr>`
        )
        .join("");
      const total = g.total
        ? `<tr class="total">${g.total.map((v, c) => `<td class="${list.columns[c].left ? "l" : ""}">${escapeHtml(v)}</td>`).join("")}</tr>`
        : "";
      return `<section class="grp">${
        g.heading
          ? `<div class="gh" style="--c:${c1};--t:${tint}"><b>${escapeHtml(g.heading)}</b>${
              g.note ? `<span>${escapeHtml(g.note)}</span>` : ""
            }</div>`
          : ""
      }<table style="--c:${c1};--t:${tint}">${colgroup}${thead}<tbody>${body}${total}</tbody></table></section>`;
    })
    .join("");

  return `<section class="doc">
<div class="band">${MATH}
<div class="t1">Concursul Regional de Matematică „Misterele Matematicii”</div>
<div class="t2">${escapeHtml(edition)}</div>
<div class="org">${escapeHtml(ORGANIZER)}</div>
</div>
<h1>${escapeHtml(list.title)}</h1>
<div class="rule"></div>
${tables}
<div class="foot"><span>Întocmit: ______________________</span><span>Director: ______________________</span></div>
</section>`;
};

const DOC_CSS = (landscape) => `@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 9mm 9mm 11mm; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
body { font-family: Calibri, "Segoe UI", Arial, sans-serif; color: #000; margin: 0; }
.doc { break-after: page; page-break-after: always; }
.doc:last-child { break-after: auto; page-break-after: auto; }
.band { position: relative; overflow: hidden; color: #fff; text-align: center; border-radius: 12px; padding: 8px 14px 9px;
  background: radial-gradient(circle at 8% 0%, rgba(251,191,36,.5) 0%, transparent 40%), linear-gradient(135deg, #1e1b4b, #1e3a8a 50%, #0e7490); }
.band .m { position: absolute; font-size: 22pt; font-weight: bold; color: rgba(255,255,255,.14); transform: translate(-50%,-50%) rotate(-12deg); font-family: "Times New Roman", serif; }
.band > div { position: relative; }
.band .t1 { font-weight: bold; font-size: 14pt; font-family: "Times New Roman", serif; }
.band .t2 { font-weight: bold; font-size: 11.5pt; }
.band .org { font-style: italic; font-size: 9.5pt; opacity: .92; }
h1 { text-align: center; font-family: "Times New Roman", serif; font-size: 18pt; font-variant: small-caps; letter-spacing: 2px; margin: 9px 0 0; }
.rule { height: 3px; width: 45%; margin: 4px auto 8px; border-radius: 3px; background: linear-gradient(90deg, transparent, #1e3a8a, #f59e0b, #0e7490, transparent); }
.grp { margin-top: 7px; }
.gh { display: flex; align-items: baseline; gap: 10px; padding: 4px 10px; border-radius: 8px 8px 0 0; background: var(--c); color: #fff; break-after: avoid; page-break-after: avoid; }
.gh b { font-size: 12.5pt; letter-spacing: .5px; }
.gh span { font-size: 9pt; opacity: .9; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9.5pt; line-height: 1.2; }
th, td { border: 1px solid #555; padding: 3px 5px; text-align: center; vertical-align: middle; overflow-wrap: anywhere; }
thead th { background: var(--t); color: var(--c); font-size: 9pt; }
thead { display: table-header-group; }
tbody tr:nth-child(even) td { background: #f8fafc; }
td.l { text-align: left; } td.b { font-weight: bold; }
tr { break-inside: avoid; page-break-inside: avoid; }
tr.total td { background: var(--t) !important; color: var(--c); font-weight: bold; }
.foot { display: flex; justify-content: space-between; margin-top: 12mm; font-size: 10.5pt; break-inside: avoid; }
.toolbar { position: sticky; top: 0; z-index: 1; background: #2c3e50; color: #fff; padding: 10px; text-align: center; font-family: Arial, sans-serif; }
.toolbar button { font-size: 15px; padding: 8px 18px; margin-left: 10px; cursor: pointer; }
@media screen { body { background: #e5e7eb; } .doc { width: ${landscape ? "279mm" : "192mm"}; background: #fff; padding: 7mm; margin: 12px auto; box-shadow: 0 2px 8px rgba(0,0,0,.2); } }
@media print { .toolbar { display: none; } }`;

export const printReportPdf = (id, data, header) => {
  const list = LISTS[id];
  const edition = editionLine(header);
  const html = `<!doctype html><html lang="ro"><head><meta charset="utf-8">
<title>${escapeHtml(list.title)}${edition ? ` - ${escapeHtml(edition)}` : ""}</title>
<style>${DOC_CSS(list.landscape)}</style></head><body>
<div class="toolbar">La „Destinație” alegeți <b>Salvează ca PDF</b> (sau imprimanta).
<button onclick="window.print()">🖨️ Printează / Salvează ca PDF</button></div>
${listHtml(id, data, header)}
</body></html>`;
  openPrintWindow(html, list.file);
};

// ====== EXCEL ======
const thin = { style: "thin", color: { rgb: "808080" } };
const cs = ({ fill = "FFFFFF", bold = false, size = 11, left = false, color = "000000" } = {}) => ({
  font: { name: "Calibri", sz: size, bold, color: { rgb: color } },
  fill: { patternType: "solid", fgColor: { rgb: fill } },
  alignment: { horizontal: left ? "left" : "center", vertical: "center", wrapText: true },
  border: { top: thin, bottom: thin, left: thin, right: thin },
});
const hex = (c) => c.replace("#", "").toUpperCase();

// o foaie: antet (3 rânduri) + titlu, apoi grupurile (cu bandă colorată) și tabelul
const listSheet = (id, data, header) => {
  const list = LISTS[id];
  const n = list.columns.length;
  const pad = Array(n - 1).fill("");
  const aoa = [
    ["Concursul Regional de Matematică „Misterele Matematicii”", ...pad],
    [`${editionLine(header)} · ${ORGANIZER}`, ...pad],
    [list.title.toUpperCase(), ...pad],
  ];
  const kinds = ["t1", "t2", "t3"];
  const colors = [null, null, null];
  list.groups(data).forEach((g) => {
    const col = g.color || ["#1e3a8a", "#e0e7ff"];
    if (g.heading) {
      aoa.push([`${g.heading}${g.note ? ` — ${g.note}` : ""}`, ...pad]);
      kinds.push("gh");
      colors.push(col);
    }
    aoa.push(list.columns.map((c) => c.label));
    kinds.push("th");
    colors.push(col);
    g.rows.forEach((row, i) => {
      aoa.push(row.map((v, c) => (c === 2 && id === "rezultate" ? (v == null ? "—" : v) : v ?? "")));
      kinds.push(i % 2 ? "rz" : "r");
      colors.push(col);
    });
    if (g.total) {
      aoa.push(g.total);
      kinds.push("tot");
      colors.push(col);
    }
    aoa.push(Array(n).fill(""));
    kinds.push("gap");
    colors.push(null);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const merges = [];
  aoa.forEach((_, r) => {
    if (["t1", "t2", "t3", "gh"].includes(kinds[r])) merges.push({ s: { r, c: 0 }, e: { r, c: n - 1 } });
  });
  ws["!merges"] = merges;
  ws["!cols"] = list.columns.map((c) => ({ wch: c.wch }));
  ws["!rows"] = kinds.map((k) => ({ hpt: k === "t1" ? 24 : k === "t3" ? 24 : k === "th" ? 30 : k === "gap" ? 10 : 20 }));
  aoa.forEach((row, r) =>
    row.forEach((_, c) => {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      const k = kinds[r];
      const [c1, tint] = (colors[r] || ["#1e3a8a", "#e0e7ff"]).map(hex);
      const col = list.columns[c];
      if (k === "t1") ws[ref].s = cs({ fill: "1E1B4B", bold: true, size: 14, color: "FFFFFF" });
      else if (k === "t2") ws[ref].s = cs({ fill: "1E3A8A", color: "FFFFFF" });
      else if (k === "t3") ws[ref].s = cs({ fill: "FEF3C7", bold: true, size: 13, color: "7F1D1D" });
      else if (k === "gh") ws[ref].s = cs({ fill: c1, bold: true, size: 12, color: "FFFFFF", left: true });
      else if (k === "th") ws[ref].s = cs({ fill: tint, bold: true, color: c1 });
      else if (k === "r" || k === "rz")
        ws[ref].s = cs({ fill: k === "rz" ? "F8FAFC" : "FFFFFF", bold: !!col.bold, left: !!col.left });
      else if (k === "tot") ws[ref].s = cs({ fill: tint, bold: true, color: c1, left: !!col.left });
      else ws[ref].s = { font: { name: "Calibri", sz: 11 } };
      if (id === "rezultate" && c === 2 && (k === "r" || k === "rz") && typeof ws[ref].v === "number") ws[ref].z = "0.##";
    })
  );
  return ws;
};

const SHEET_NAMES = { rezultate: "Rezultate", scoli: "Scoli participante", profesori: "Profesori indrumatori" };

const save = (wb, name) => {
  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  FileSaver.saveAs(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8" }),
    `${name}_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
};

export const exportReportExcel = (ids, data, header, fileName) => {
  const wb = XLSX.utils.book_new();
  ids.forEach((id) => XLSX.utils.book_append_sheet(wb, listSheet(id, data, header), SHEET_NAMES[id]));
  save(wb, fileName || LISTS[ids[0]].file);
};
