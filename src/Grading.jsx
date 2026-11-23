// Notare și rezultate: introducerea punctajelor, premii automate, filtre, sortări, exporturi.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import styles from "./Grading.module.css";
import { CLASS_ORDER } from "./allocation";
import { loadContestStudents, loadHeader } from "./contestData";
import {
  GRADES_COLLECTION,
  SUBJECTS,
  AWARDS,
  awardRank,
  buildResults,
  classRank,
  compareRanking,
  formatScore,
  formatSuma,
  sumaTier,
  MAX_SUM,
  parseScore,
  prizeWarnings,
} from "./grading";
import { exportResultsExcel, printResultsPdf } from "./gradingExport";

const EMPTY_FILTERS = { q: "", clasa: "", scoala: "", profesor: "", sala: "", premiu: "", stare: "" };

const codeNumber = (cod) => parseInt(String(cod || "").split("_").pop(), 10) || Infinity;

// sortare după orice coloană; valorile lipsă rămân mereu la final; la egalitate → ordinea de clasament
const compareBy = (key, dir) => (a, b) => {
  const sign = dir === "asc" ? 1 : -1;
  const pick = (r) => {
    switch (key) {
      case "clasa":
        return classRank(r.clasa);
      case "premiu":
        return r.premiu ? awardRank(r.premiu) : null;
      case "cod":
        return r.cod ? codeNumber(r.cod) : null;
      case "nume":
        return r.nume;
      case "sala":
        return r.salaCod || null;
      default:
        return r[key] === "" || r[key] === undefined ? null : r[key];
    }
  };
  const va = pick(a);
  const vb = pick(b);
  // fără coduri: ordine fixă (clasă, nume), ca rândurile să nu se mute în timp ce se notează
  if (va === null && vb === null)
    return key === "cod"
      ? classRank(a.clasa) - classRank(b.clasa) || a.nume.localeCompare(b.nume, "ro", { sensitivity: "base" })
      : compareRanking(a, b);
  if (va === null) return 1;
  if (vb === null) return -1;
  const diff =
    typeof va === "number" && typeof vb === "number"
      ? va - vb
      : String(va).localeCompare(String(vb), "ro", { sensitivity: "base", numeric: true });
  return diff * sign || compareRanking(a, b);
};

// cardurile claselor: aceeași familie de culori ca pe listele din săli
const CLASS_THEME = {
  "a IV-a": { cls: "classIV", roman: "IV" },
  "a V-a": { cls: "classV", roman: "V" },
  "a VI-a": { cls: "classVI", roman: "VI" },
  "a VII-a": { cls: "classVII", roman: "VII" },
};

// butoanele mari de ordonare
const SORT_MODES = [
  {
    id: "suma",
    icon: "🏆",
    label: "După sumă",
    title: "Pe fiecare clasă, de la suma cea mai mare la cea mai mică",
    sort: { key: "clasament", dir: "asc" },
  },
  {
    id: "alfabetic",
    icon: "🔤",
    label: "Alfabetic",
    title: "După nume, A → Z, indiferent de notă",
    sort: { key: "nume", dir: "asc" },
  },
  {
    id: "notare",
    icon: "✏️",
    label: "Pentru notare",
    title: "Ordine fixă (cod / clasă + nume): rândurile nu se mută în timp ce introduceți note",
    sort: { key: "cod", dir: "asc" },
  },
];

const TABLE_COLUMNS = [
  { key: "loc", label: "Loc", defaultDir: "asc" },
  { key: "cod", label: "Cod", defaultDir: "asc" },
  { key: "nume", label: "Nume și prenume", defaultDir: "asc" },
  { key: "clasa", label: "Clasa", defaultDir: "asc" },
  ...SUBJECTS.map((s) => ({ key: s.key, label: s.label, defaultDir: "desc", input: true })),
  { key: "suma", label: "Suma", defaultDir: "desc" },
  { key: "premiu", label: "Premiu", defaultDir: "asc" },
  { key: "absent", label: "Abs.", title: "Absent", noSort: true },
  { key: "scoala", label: "Școala", defaultDir: "asc" },
  { key: "profesor", label: "Profesor", defaultDir: "asc" },
  { key: "sala", label: "Sala", defaultDir: "asc" },
];

function Grading({ onDashboard, stageBar }) {
  const [header] = useState(loadHeader);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [students, setStudents] = useState([]);
  const [grades, setGrades] = useState({});
  const [drafts, setDrafts] = useState({});
  const [cellErrors, setCellErrors] = useState({});
  const [saveError, setSaveError] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  // implicit în ordinea codurilor: ordinea nu se schimbă în timp ce se introduc notele
  const [sort, setSort] = useState({ key: "cod", dir: "asc" });
  // fără coduri, notele s-ar salva pe alte înregistrări: tabelul devine doar de citit
  const [codesFailed, setCodesFailed] = useState(false);
  // elevii notați de când s-a ales filtrul rămân în tabel (nu dispar în timp ce se tastează)
  const [pinned, setPinned] = useState(() => new Set());
  // note trimise, dar încă neconfirmate de server (ex. fără internet)
  const pendingRef = useRef(0);
  const [pendingSaves, setPendingSaves] = useState(0);

  // elevii (o dată) + notele (în timp real: ce notează alt profesor apare imediat)
  useEffect(() => {
    let alive = true;
    loadContestStudents()
      .then((data) => {
        if (!alive) return;
        setStudents(data.students);
        if (data.codesError) {
          setCodesFailed(true);
          setLoadError(
            "Codurile elevilor nu au putut fi citite, așa că notarea e blocată (notele s-ar salva greșit). Reîncărcați pagina."
          );
        }
      })
      .catch((err) => {
        console.error(err);
        if (alive) setLoadError("Elevii nu au putut fi încărcați.");
      })
      .finally(() => alive && setLoading(false));

    const unsub = onSnapshot(
      collection(db, GRADES_COLLECTION),
      (snap) => {
        const map = {};
        snap.forEach((d) => (map[d.id] = d.data()));
        setGrades(map);
      },
      (err) => {
        console.error(err);
        setLoadError("Notele nu au putut fi citite.");
      }
    );
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  // mesajul apare doar dacă salvarea întârzie (altfel ar clipi la fiecare notă)
  const [slowSave, setSlowSave] = useState(false);
  const saving = pendingSaves > 0;
  useEffect(() => {
    if (!saving) {
      setSlowSave(false);
      return undefined;
    }
    const t = setTimeout(() => setSlowSave(true), 1500);
    return () => clearTimeout(t);
  }, [saving]);

  useEffect(() => {
    if (!saving) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);

  const rows = useMemo(() => buildResults(students, grades), [students, grades]);
  const sortModeId = SORT_MODES.find((m) => m.sort.key === sort.key && m.sort.dir === sort.dir)?.id || null;

  const options = useMemo(() => {
    const uniq = (f) =>
      [...new Set(rows.map(f).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "ro", { sensitivity: "base", numeric: true })
      );
    return {
      clase: CLASS_ORDER.filter((c) => rows.some((r) => r.clasa === c)),
      scoli: uniq((r) => r.scoala),
      profesori: uniq((r) => r.profesor),
      sali: uniq((r) => r.salaCod),
    };
  }, [rows]);

  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (pinned.has(r.id)) return true;
      if (q && !`${r.nume} ${r.cod || ""}`.toLowerCase().includes(q)) return false;
      if (filters.clasa && r.clasa !== filters.clasa) return false;
      if (filters.scoala && r.scoala !== filters.scoala) return false;
      if (filters.profesor && r.profesor !== filters.profesor) return false;
      if (filters.sala && r.salaCod !== filters.sala) return false;
      if (filters.stare === "fara-cod") {
        if (r.cod) return false;
      } else if (filters.stare && r.stare !== filters.stare) return false;
      switch (filters.premiu) {
        case "":
          break;
        case "premiati":
          if (!r.premiu) return false;
          break;
        case "I-III":
          if (!["I", "II", "III"].includes(r.premiu)) return false;
          break;
        case "mentiuni":
          if (!["M1", "M2", "M3", "M", "SSMR"].includes(r.premiu)) return false;
          break;
        case "fara":
          if (r.premiu || r.absent) return false;
          break;
        default:
          if (r.premiu !== filters.premiu) return false;
      }
      return true;
    });
    return list.sort(sort.key === "clasament" ? compareRanking : compareBy(sort.key, sort.dir));
  }, [rows, filters, sort, pinned]);

  const stats = useMemo(
    () =>
      CLASS_ORDER.filter((c) => rows.some((r) => r.clasa === c)).map((c) => {
        const list = rows.filter((r) => r.clasa === c);
        return {
          clasa: c,
          total: list.length,
          notati: list.filter((r) => r.stare === "notat").length,
          absenti: list.filter((r) => r.stare === "absent").length,
          premii: list.filter((r) => r.premiu).length,
        };
      }),
    [rows]
  );

  // premii puse unor elevi nenotați, egalități cu premii diferite, premii inversate
  const awardWarnings = useMemo(() => prizeWarnings(rows), [rows]);

  // ====== ȘTERGERE TOATE NOTELE ======
  const [deleting, setDeleting] = useState(false);
  const gradedCount = Object.keys(grades).length;
  const deleteAllGrades = async () => {
    if (gradedCount === 0) return;
    const answer = window.prompt(
      `Se vor șterge DEFINITIV toate notele (${gradedCount} elevi), cu sume, premii și absenți.\n` +
        "Nu se poate anula.\n\nScrieți STERGE ca să confirmați:"
    );
    if (answer === null) return;
    if (answer.trim().toUpperCase().replace("Ș", "S") !== "STERGE") {
      window.alert("Nu ați scris STERGE. Nu s-a șters nimic.");
      return;
    }
    setDeleting(true);
    try {
      const ids = Object.keys(grades);
      for (let i = 0; i < ids.length; i += 400) {
        const batch = writeBatch(db);
        ids.slice(i, i + 400).forEach((id) => batch.delete(doc(db, GRADES_COLLECTION, id)));
        await batch.commit();
      }
      setDrafts({});
      setCellErrors({});
      setSaveError(null);
      window.alert(`✅ Au fost șterse notele a ${ids.length} elevi.`);
    } catch (err) {
      console.error("Eroare la ștergerea notelor:", err);
      setSaveError("Notele nu au putut fi șterse. Verificați conexiunea și încercați din nou.");
    } finally {
      setDeleting(false);
    }
  };

  // ====== SALVARE ======
  const save = async (row, fields) => {
    if (codesFailed) return false;
    setPinned((prev) => (prev.has(row.id) ? prev : new Set(prev).add(row.id)));
    pendingRef.current += 1;
    setPendingSaves(pendingRef.current);
    try {
      await setDoc(
        doc(db, GRADES_COLLECTION, row.gradeId),
        { ...fields, nume: row.nume, clasa: row.clasa, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setSaveError(null);
      return true;
    } catch (err) {
      console.error("Eroare la salvarea notei:", err);
      setSaveError(`Nota pentru ${row.cod || row.nume} nu s-a salvat. Verificați conexiunea și încercați din nou.`);
      return false;
    } finally {
      pendingRef.current -= 1;
      setPendingSaves(pendingRef.current);
    }
  };

  const cellKey = (row, key) => `${row.gradeId}|${key}`;

  const commit = async (row, key) => {
    const k = cellKey(row, key);
    if (!(k in drafts)) return;
    const parsed = parseScore(drafts[k]);
    if (parsed.error) {
      setCellErrors((prev) => ({ ...prev, [k]: parsed.error }));
      return;
    }
    setCellErrors((prev) => {
      const next = { ...prev };
      delete next[k];
      return next;
    });
    if (parsed.value === row[key]) {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
      return;
    }
    if (await save(row, { [key]: parsed.value })) {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
    }
  };

  // prima căsuță activă pe coloana dată, pornind de la rândul `from`, în direcția `step` (absenții sunt săriți)
  const findCell = (from, step, col) => {
    for (let r = from; r >= 0 && r < visible.length; r += step) {
      const el = document.querySelector(`input[data-row="${r}"][data-col="${col}"]`);
      if (el && !el.disabled) return el;
    }
    return null;
  };

  const onCellKeyDown = (e, row, key, index) => {
    if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      commit(row, key);
      const step = e.key === "ArrowUp" ? -1 : 1;
      const target = findCell(index + step, step, key);
      // la capătul listei: ieșim din căsuță, ca cifrele următoare să nu se lipească de nota de aici
      if (target) target.focus();
      else e.target.blur();
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      // ← / → trec la subiectul vecin, dar doar când cursorul e la capătul textului
      // (sau tot textul e selectat), ca să se poată corecta și în interiorul notei
      const { selectionStart, selectionEnd, value } = e.target;
      const right = e.key === "ArrowRight";
      if (right ? selectionEnd !== value.length : selectionStart !== 0) return;
      const col = SUBJECTS.findIndex((s) => s.key === key);
      let nextCol = col + (right ? 1 : -1);
      let nextRow = index;
      // după Sub. III → Sub. I la elevul următor; înainte de Sub. I → Sub. III la elevul anterior
      if (nextCol >= SUBJECTS.length) {
        nextCol = 0;
        nextRow = index + 1;
      } else if (nextCol < 0) {
        nextCol = SUBJECTS.length - 1;
        nextRow = index - 1;
      }
      const nextKey = SUBJECTS[nextCol].key;
      const target =
        nextRow === index
          ? document.querySelector(`input[data-row="${index}"][data-col="${nextKey}"]`)
          : findCell(nextRow, nextRow > index ? 1 : -1, nextKey);
      if (!target) return;
      e.preventDefault();
      commit(row, key);
      target.focus();
    } else if (e.key === "Escape") {
      const k = cellKey(row, key);
      setDrafts((prev) => {
        const nextDrafts = { ...prev };
        delete nextDrafts[k];
        return nextDrafts;
      });
      setCellErrors((prev) => {
        const nextErrors = { ...prev };
        delete nextErrors[k];
        return nextErrors;
      });
    }
  };

  // ====== SORTARE / FILTRE / EXPORT ======
  const toggleSort = (col) => {
    if (col.noSort) return;
    setSort((prev) =>
      prev.key === col.key
        ? { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key: col.key, dir: col.defaultDir || "asc" }
    );
  };
  const sortMark = (key) => (sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "");

  const setFilter = (field, value) => {
    setPinned(new Set());
    setFilters((prev) => ({ ...prev, [field]: value }));
  };


  // cele 4 liste de descărcat (din elevii afișați în tabel, în ordinea de acum)
  const DOWNLOADS = [
    {
      id: "avizier",
      icon: "📢",
      title: "Avizier – cu coduri",
      hint: "Cod, note, sumă – fără nume și fără premii (anonim), pentru avizier / site",
      columns: ["nr", "cod", "s1", "s2", "s3", "suma"],
      subtitle: "Rezultate",
    },
    {
      id: "avizierFaraAbsent",
      icon: "🫥",
      title: "Avizier – fără marcaj absent",
      hint: "Ca avizierul cu coduri, dar absenții NU apar ca absenți (rândul lor rămâne fără note și fără sumă)",
      columns: ["nr", "cod", "s1", "s2", "s3", "suma"],
      subtitle: "Rezultate",
      hideAbsent: true,
    },
    {
      id: "rezultate",
      icon: "🧑‍🎓",
      title: "Rezultate",
      hint: "Nume, note, sumă, premiu, școală, profesor – fără coduri",
      columns: ["nr", "nume", "s1", "s2", "s3", "suma", "premiu", "scoala", "profesor"],
      subtitle: "Rezultate",
    },
    {
      id: "borderou",
      icon: "📋",
      title: "Borderou – cod + nume",
      hint: "Cod + nume + note, sumă, premiu, școală, profesor, sală – pentru comisie",
      columns: ["nr", "cod", "nume", "s1", "s2", "s3", "suma", "premiu", "scoala", "profesor", "sala"],
      subtitle: "Borderou",
    },
    {
      id: "premianti",
      icon: "🏆",
      title: "Premianți",
      hint: "Doar elevii cu premiu (I – M), cu școala și profesorul – pentru diplome",
      columns: ["nr", "nume", "premiu", "suma", "scoala", "profesor"],
      subtitle: "Lista premianților",
      onlyAwarded: true,
    },
  ];

  const doExport = (kind, id) => {
    const unsaved = Object.keys(drafts).length + Object.keys(cellErrors).length;
    if (
      unsaved > 0 &&
      !window.confirm(
        `Există ${unsaved} note scrise dar nesalvate (sau greșite, marcate cu roșu). Exportul folosește notele salvate. Continuați?`
      )
    ) {
      return;
    }
    const list = DOWNLOADS.find((d) => d.id === id);
    const picked = list.onlyAwarded ? visible.filter((r) => r.premiu) : visible;
    // absenții apar ca orice alt elev: fără „absent”, fără note și fără sumă
    const rowsOut = list.hideAbsent
      ? picked.map((r) => (r.absent ? { ...r, absent: false, s1: null, s2: null, s3: null, suma: null, premiu: "" } : r))
      : picked;
    if (rowsOut.length === 0) {
      window.alert(list.onlyAwarded ? "Nu există încă elevi cu premiu în listă." : "Nu există elevi în listă.");
      return;
    }
    const notDone = rowsOut.filter((r) => r.stare === "nenotat" || r.stare === "incomplet").length;
    if (
      notDone > 0 &&
      !window.confirm(`${notDone} elevi din listă nu sunt notați complet (vor apărea fără sumă). Descărcați oricum?`)
    ) {
      return;
    }
    const fileLabel = [list.subtitle, filters.clasa && `clasa ${filters.clasa}`].filter(Boolean).join(" ");
    const opts = { columns: list.columns, byClass: true, header, subtitle: list.subtitle, fileLabel };
    if (kind === "excel") exportResultsExcel(rowsOut, opts);
    else printResultsPdf(rowsOut, opts);
  };

  // ====== RENDER ======
  if (loading) return <div className={styles.loading}>Se încarcă elevii și notele...</div>;

  const filtersActive = Object.values(filters).some(Boolean);

  return (
    <div className={styles.page}>
      {stageBar}
      <div className={styles.topBar}>
        {onDashboard && (
          <button onClick={onDashboard} className={styles.backButton}>
            ← Panou Admin
          </button>
        )}
        <h1 className={styles.title}>📝 Notare și rezultate</h1>
      </div>

      {loadError && <div className={styles.error}>❌ {loadError}</div>}
      {saveError && <div className={styles.error}>❌ {saveError}</div>}
      {pendingSaves > 0 && slowSave && (
        <div className={styles.pending} role="status">
          ⏳ Se salvează {pendingSaves === 1 ? "o notă" : `${pendingSaves} note`}… Nu închideți pagina până dispare
          mesajul (dacă nu dispare, verificați internetul).
        </div>
      )}

      {/* situația pe clase */}
      <div className={styles.stats}>
        {stats.map((s) => {
          const theme = CLASS_THEME[s.clasa] || { cls: "classOther", roman: "" };
          const present = s.total - s.absenti;
          const pct = present ? Math.round((s.notati / present) * 100) : 0;
          const active = filters.clasa === s.clasa;
          return (
            <button
              key={s.clasa}
              className={`${styles.statCard} ${styles[theme.cls]} ${active ? styles.statActive : ""} ${
                filters.clasa && !active ? styles.statDimmed : ""
              }`}
              onClick={() => setFilter("clasa", active ? "" : s.clasa)}
              title={active ? "Arată toate clasele" : "Arată doar această clasă"}
              aria-pressed={active}
            >
              <span className={styles.statRoman} aria-hidden="true">
                {theme.roman}
              </span>
              <div className={styles.statClass}>Clasa {s.clasa}</div>
              <div className={styles.statLine}>
                notați <b>{s.notati}</b> / {present}
                <span className={styles.statPct}>{pct}%</span>
              </div>
              <div className={styles.progress}>
                <div style={{ width: `${pct}%` }} />
              </div>
              <div className={styles.statSmall}>
                {s.absenti} absenți · {s.premii} premii
              </div>
            </button>
          );
        })}
      </div>

      {awardWarnings.length > 0 && (
        <div
          role="alert"
          style={{
            margin: "12px 0",
            padding: "10px 14px",
            borderRadius: 10,
            background: "#fff7ed",
            border: "1px solid #f59e0b",
            color: "#7c2d12",
          }}
        >
          <b>⚠️ Verificați premiile înainte de diplome:</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
            {awardWarnings.slice(0, 8).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          {awardWarnings.length > 8 && <div>… și încă {awardWarnings.length - 8}.</div>}
        </div>
      )}

      {/* filtre */}
      <div className={styles.panel}>
        <div className={styles.filters}>
          <input
            type="search"
            placeholder="🔍 Caută nume sau cod..."
            value={filters.q}
            onChange={(e) => setFilter("q", e.target.value)}
            className={styles.search}
          />
          <select value={filters.clasa} onChange={(e) => setFilter("clasa", e.target.value)}>
            <option value="">Toate clasele</option>
            {options.clase.map((c) => (
              <option key={c} value={c}>
                Clasa {c}
              </option>
            ))}
          </select>
          <select value={filters.premiu} onChange={(e) => setFilter("premiu", e.target.value)}>
            <option value="">Toate premiile</option>
            <option value="premiati">Doar premiații (I – M)</option>
            <option value="I-III">Premiile I, II, III</option>
            <option value="mentiuni">Doar mențiunile (M1 – M, SSMR)</option>
            {AWARDS.map((a) => (
              <option key={a.value} value={a.value}>
                Doar {a.label}
              </option>
            ))}
            <option value="fara">Fără premiu</option>
          </select>
          <select value={filters.stare} onChange={(e) => setFilter("stare", e.target.value)}>
            <option value="">Toate stările</option>
            <option value="notat">Notați complet</option>
            <option value="incomplet">Notați incomplet</option>
            <option value="nenotat">Nenotați</option>
            <option value="absent">Absenți</option>
            <option value="fara-cod">Fără cod</option>
          </select>
          <select value={filters.scoala} onChange={(e) => setFilter("scoala", e.target.value)}>
            <option value="">Toate școlile</option>
            {options.scoli.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={filters.profesor} onChange={(e) => setFilter("profesor", e.target.value)}>
            <option value="">Toți profesorii</option>
            {options.profesori.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {options.sali.length > 0 && (
            <select value={filters.sala} onChange={(e) => setFilter("sala", e.target.value)}>
              <option value="">Toate sălile</option>
              {options.sali.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          {filtersActive && (
            <button className={styles.linkButton} onClick={() => {
                setPinned(new Set());
                setFilters(EMPTY_FILTERS);
              }}>
              ✖ Șterge filtrele
            </button>
          )}
        </div>
        <div className={styles.sortBar}>
          <span className={styles.sortLabel}>Ordonează:</span>
          <div className={styles.sortGroup}>
            {SORT_MODES.map((m) => (
              <button
                key={m.id}
                className={`${styles.sortButton} ${sortModeId === m.id ? styles.sortActive : ""}`}
                onClick={() => setSort(m.sort)}
                title={m.title}
              >
                <span className={styles.sortIcon}>{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.dlBar}>
          <span className={styles.sortLabel}>Descarcă:</span>
          {DOWNLOADS.map((d) => (
            <div key={d.id} className={styles.dlCard} title={d.hint}>
              <span className={styles.dlTitle}>
                {d.icon} {d.title}
              </span>
              <button className={styles.dlExcel} onClick={() => doExport("excel", d.id)} title={`${d.title} – Excel`}>
                Excel
              </button>
              <button className={styles.dlPdf} onClick={() => doExport("pdf", d.id)} title={`${d.title} – PDF`}>
                PDF
              </button>
            </div>
          ))}
        </div>
        <p className={styles.prizeMoved}>
          💰 Tabelul cu <b>premiile în bani</b> (Asociația „Arcașii lui Ștefan”) se descarcă acum din{" "}
          <b>Tipărire › Premii în bani</b>. Aici rămân doar premiile alese pe fiecare elev.
        </p>
        <p className={styles.dlHint}>
          Se descarcă elevii afișați în tabel ({filters.clasa ? `clasa ${filters.clasa}` : "toate clasele, câte o foaie / pagină pe clasă"}), în ordinea aleasă. Țineți mouse-ul pe o listă ca să vedeți ce conține.
        </p>
        <div className={styles.sortInfo}>
          <span>
            {visible.length} elevi afișați
            {!sortModeId && (
              <>
                {" "}
                · ordonați după <b>{TABLE_COLUMNS.find((c) => c.key === sort.key)?.label}</b>{" "}
                {sort.dir === "asc" ? "↑" : "↓"}
              </>
            )}
          </span>
          <span className={styles.hint}>
            Fiecare rând se mută întreg (elev, note, sumă, premiu). Poți sorta și cu clic pe capul unei coloane.
            La note: ← / → subiectul vecin, Enter / ↓ elevul următor, Esc anulează.
          </span>
        </div>
      </div>

      {/* tabelul de notare */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {TABLE_COLUMNS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c)}
                  title={c.title || (c.noSort ? "" : "Sortează")}
                  className={c.noSort ? "" : styles.sortable}
                >
                  {c.label}
                  {sortMark(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const canEdit = !r.absent && !codesFailed;
              return (
                <tr key={r.id} className={r.absent ? styles.absentRow : ""}>
                  <td>{r.loc ?? ""}</td>
                  <td className={styles.code}>{r.cod || <span className={styles.muted}>fără cod</span>}</td>
                  <td className={styles.name}>{r.nume}</td>
                  <td>{r.clasa}</td>
                  {SUBJECTS.map(({ key }) => {
                    const k = cellKey(r, key);
                    const err = cellErrors[k];
                    return (
                      <td key={key} className={styles.scoreCell}>
                        <input
                          data-row={i}
                          data-col={key}
                          className={`${styles.scoreInput} ${err ? styles.inputError : ""} ${
                            k in drafts && !err ? styles.inputDirty : ""
                          }`}
                          value={k in drafts ? drafts[k] : formatScore(r[key])}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [k]: e.target.value }))}
                          onBlur={() => commit(r, key)}
                          onKeyDown={(e) => onCellKeyDown(e, r, key, i)}
                          onFocus={(e) => e.target.select()}
                          disabled={!canEdit}
                          inputMode="decimal"
                          title={err || ""}
                        />
                      </td>
                    );
                  })}
                  <td className={styles.total}>
                    {r.absent ? (
                      <span className={styles.mediaAbsent}>absent</span>
                    ) : r.suma !== null ? (
                      <span
                        className={`${styles.mediaPill} ${styles[`media_${sumaTier(r.suma)}`]}`}
                        title={`Suma: ${formatSuma(r.suma)} puncte din ${MAX_SUM} (${SUBJECTS.length} subiecte)`}
                      >
                        {formatSuma(r.suma)}
                      </span>
                    ) : r.stare === "incomplet" ? (
                      <span className={styles.mediaPending} title="Lipsesc note la unele subiecte">
                        incomplet
                      </span>
                    ) : (
                      <span className={styles.mediaEmpty}>—</span>
                    )}
                  </td>
                  <td className={styles.award}>
                    <select
                      className={styles.awardSelect}
                      value={r.premiu}
                      disabled={r.absent || codesFailed || (r.stare !== "notat" && !r.premiu)}
                      onChange={(e) => save(r, { premiu: e.target.value })}
                      title={r.stare === "notat" ? "Premiul (se alege manual)" : "Premiul se dă după ce elevul e notat complet"}
                    >
                      <option value="">—</option>
                      {AWARDS.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={r.absent}
                      onChange={(e) => save(r, { absent: e.target.checked })}
                      disabled={codesFailed}
                      title="Absent"
                    />
                  </td>
                  <td className={styles.small}>{r.scoala}</td>
                  <td className={styles.small}>{r.profesor}</td>
                  <td className={styles.small}>{r.salaCod || ""}</td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={TABLE_COLUMNS.length} className={styles.empty}>
                  Niciun elev nu corespunde filtrelor.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ștergerea tuturor notelor */}
      <div className={styles.dangerPanel}>
        <div>
          <h2 className={styles.dangerTitle}>🧹 Pornește notarea de la zero</h2>
          <p className={styles.dangerText}>
            Șterge <b>toate notele</b> ({gradedCount} {gradedCount === 1 ? "elev notat" : "elevi notați"}), deci și
            sumele, premiile și bifele de absent. Elevii, codurile și repartizarea rămân neatinse.
          </p>
        </div>
        <button className={styles.dangerButton} onClick={deleteAllGrades} disabled={deleting || gradedCount === 0}>
          {deleting ? "Se șterge..." : "🗑️ Șterge toate notele"}
        </button>
      </div>
    </div>
  );
}

export default Grading;
