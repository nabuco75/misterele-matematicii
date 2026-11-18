// Notare și rezultate: introducerea punctajelor, premii automate, filtre, sortări, exporturi.
import React, { useEffect, useMemo, useState } from "react";
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
  formatMedia,
  mediaTier,
  parseScore,
} from "./grading";
import { EXPORT_COLUMNS, exportResultsExcel, printResultsPdf } from "./gradingExport";

const EMPTY_FILTERS = { q: "", clasa: "", scoala: "", profesor: "", sala: "", premiu: "", stare: "" };

// modele de liste gata făcute; se pot ajusta apoi din bifele de coloane
const PRESETS = [
  {
    id: "afisare",
    label: "📢 Afișare pe coduri (fără nume)",
    columns: ["nr", "cod", "s1", "s2", "s3", "media", "premiu"],
    subtitle: "Rezultate",
    premiu: "",
  },
  {
    id: "borderou",
    label: "📋 Borderou complet (cod + nume)",
    columns: ["nr", "cod", "nume", "s1", "s2", "s3", "media", "premiu", "scoala", "profesor"],
    subtitle: "",
    premiu: "",
  },
  {
    id: "nume",
    label: "🧑‍🎓 Rezultate cu nume (fără coduri)",
    columns: ["nr", "nume", "s1", "s2", "s3", "media", "premiu", "scoala", "profesor"],
    subtitle: "Rezultate",
    premiu: "",
  },
  {
    id: "premiati",
    label: "🏆 Lista premianților",
    columns: ["nr", "nume", "premiu", "media", "scoala", "profesor"],
    subtitle: "Lista premianților",
    premiu: "premiati",
  },
];

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

// butoanele mari de ordonare
const SORT_MODES = [
  {
    id: "medie",
    icon: "🏆",
    label: "După medie",
    title: "Pe fiecare clasă, de la media cea mai mare la cea mai mică",
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
  { key: "media", label: "Media", defaultDir: "desc" },
  { key: "premiu", label: "Premiu", defaultDir: "asc" },
  { key: "absent", label: "Abs.", title: "Absent", noSort: true },
  { key: "scoala", label: "Școala", defaultDir: "asc" },
  { key: "profesor", label: "Profesor", defaultDir: "asc" },
  { key: "sala", label: "Sala", defaultDir: "asc" },
];

function Grading({ onDashboard }) {
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
  const [exportCols, setExportCols] = useState(PRESETS[1].columns);
  const [byClass, setByClass] = useState(true);
  const [subtitle, setSubtitle] = useState("");
  const [presetId, setPresetId] = useState("borderou");

  // elevii (o dată) + notele (în timp real: ce notează alt profesor apare imediat)
  useEffect(() => {
    let alive = true;
    loadContestStudents()
      .then((data) => {
        if (!alive) return;
        setStudents(data.students);
        if (data.codesError) setLoadError("Codurile elevilor nu au putut fi citite.");
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
          if (!["M1", "M2", "M3", "M"].includes(r.premiu)) return false;
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
  }, [rows, filters, sort]);

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

  // ====== ȘTERGERE TOATE NOTELE ======
  const [deleting, setDeleting] = useState(false);
  const gradedCount = Object.keys(grades).length;
  const deleteAllGrades = async () => {
    if (gradedCount === 0) return;
    const answer = window.prompt(
      `Se vor șterge DEFINITIV toate notele (${gradedCount} elevi), cu medii, premii și absenți.\n` +
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

  const onCellKeyDown = (e, row, key, index) => {
    if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      commit(row, key);
      const next = e.key === "ArrowUp" ? index - 1 : index + 1;
      document.querySelector(`input[data-row="${next}"][data-col="${key}"]`)?.focus();
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
      const target = document.querySelector(
        `input[data-row="${nextRow}"][data-col="${SUBJECTS[nextCol].key}"]`
      );
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

  const setFilter = (field, value) => setFilters((prev) => ({ ...prev, [field]: value }));

  const applyPreset = (p) => {
    setPresetId(p.id);
    setExportCols(p.columns);
    setSubtitle(p.subtitle);
    setFilter("premiu", p.premiu);
    setSort({ key: "clasament", dir: "asc" });
  };

  const toggleExportCol = (key) => {
    setPresetId("");
    setExportCols((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const exportLabel = () => {
    const preset = PRESETS.find((p) => p.id === presetId);
    const base = subtitle || preset?.subtitle || "Rezultate";
    return [base, filters.clasa && `clasa ${filters.clasa}`].filter(Boolean).join(" ");
  };

  const unfinished = visible.filter((r) => r.stare === "nenotat" || r.stare === "incomplet").length;

  // descărcare rapidă pentru afișare / printare: cu coduri (fără nume) sau cu nume (fără coduri)
  const QUICK_LISTS = {
    coduri: { columns: ["nr", "cod", "s1", "s2", "s3", "media", "premiu"], label: "Rezultate pe coduri" },
    nume: {
      columns: ["nr", "nume", "s1", "s2", "s3", "media", "premiu", "scoala", "profesor"],
      label: "Rezultate",
    },
  };

  const doExport = (kind, quick) => {
    const columns = quick ? QUICK_LISTS[quick].columns : exportCols;
    if (visible.length === 0 || columns.length === 0) return;
    if (
      unfinished > 0 &&
      !window.confirm(
        `${unfinished} elevi din listă nu sunt notați complet (media apare doar la cei notați complet). Exportați oricum?`
      )
    ) {
      return;
    }
    const fileLabel = quick
      ? [subtitle || QUICK_LISTS[quick].label, filters.clasa && `clasa ${filters.clasa}`].filter(Boolean).join(" ")
      : exportLabel();
    const opts = { columns, byClass, header, subtitle: subtitle || "Rezultate", fileLabel };
    if (kind === "excel") exportResultsExcel(visible, opts);
    else printResultsPdf(visible, opts);
  };

  // ====== RENDER ======
  if (loading) return <div className={styles.loading}>Se încarcă elevii și notele...</div>;

  const filtersActive = Object.values(filters).some(Boolean);

  return (
    <div className={styles.page}>
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

      {/* situația pe clase */}
      <div className={styles.stats}>
        {stats.map((s) => (
          <button
            key={s.clasa}
            className={`${styles.statCard} ${filters.clasa === s.clasa ? styles.statActive : ""}`}
            onClick={() => setFilter("clasa", filters.clasa === s.clasa ? "" : s.clasa)}
            title="Arată doar această clasă"
          >
            <div className={styles.statClass}>Clasa {s.clasa}</div>
            <div>
              notați <b>{s.notati}</b> / {s.total - s.absenti}
            </div>
            <div className={styles.progress}>
              <div
                style={{
                  width: `${s.total - s.absenti ? (s.notati / (s.total - s.absenti)) * 100 : 0}%`,
                }}
              />
            </div>
            <div className={styles.statSmall}>
              {s.absenti} absenți · {s.premii} premii
            </div>
          </button>
        ))}
      </div>

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
            <option value="mentiuni">Doar mențiunile (M1 – M)</option>
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
            <button className={styles.linkButton} onClick={() => setFilters(EMPTY_FILTERS)}>
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
        <div className={styles.quickBar}>
          <span className={styles.sortLabel}>Descarcă pentru afișare / printare:</span>
          {[
            { id: "coduri", title: "🔢 Cu coduri", hint: "fără nume – pentru afișat la avizier" },
            { id: "nume", title: "🧑‍🎓 Fără coduri", hint: "cu numele elevilor, școala și profesorul" },
          ].map((q) => (
            <div key={q.id} className={styles.quickCard} title={q.hint}>
              <span className={styles.quickTitle}>{q.title}</span>
              <button
                className={styles.quickExcel}
                onClick={() => doExport("excel", q.id)}
                disabled={visible.length === 0}
              >
                📥 Excel
              </button>
              <button
                className={styles.quickPdf}
                onClick={() => doExport("pdf", q.id)}
                disabled={visible.length === 0}
              >
                📄 PDF
              </button>
            </div>
          ))}
        </div>
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
            Fiecare rând se mută întreg (elev, note, medie, premiu). Poți sorta și cu clic pe capul unei coloane.
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
              const canEdit = !r.absent;
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
                    ) : r.media !== null ? (
                      <span
                        className={`${styles.mediaPill} ${styles[`media_${mediaTier(r.media)}`]}`}
                        style={{ "--p": `${Math.min(100, r.media * 10)}%` }}
                        title={`Media ${formatMedia(r.media)} (din ${SUBJECTS.length} subiecte)`}
                      >
                        <span className={styles.mediaRing} />
                        <span className={styles.mediaValue}>{formatMedia(r.media)}</span>
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
                      disabled={r.absent}
                      onChange={(e) => save(r, { premiu: e.target.value })}
                      title="Premiul (se alege manual)"
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

      {/* export */}
      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>📤 Descărcare liste</h2>
        <p className={styles.hint}>
          Se descarcă <b>exact ce vedeți în tabel</b>: {visible.length} elevi, cu filtrele și ordinea de
          acum. Alegeți un model sau bifați coloanele dorite.
        </p>
        <div className={styles.presets}>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={`${styles.presetButton} ${presetId === p.id ? styles.presetActive : ""}`}
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className={styles.columnsPick}>
          {EXPORT_COLUMNS.map((c) => (
            <label key={c.key}>
              <input
                type="checkbox"
                checked={exportCols.includes(c.key)}
                onChange={() => toggleExportCol(c.key)}
              />{" "}
              {c.label}
            </label>
          ))}
        </div>
        <div className={styles.exportOptions}>
          <label>
            <input type="checkbox" checked={byClass} onChange={(e) => setByClass(e.target.checked)} />{" "}
            Câte o foaie / pagină pentru fiecare clasă
          </label>
          <label>
            Titlu listă:{" "}
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="ex: Rezultate finale"
            />
          </label>
        </div>
        {unfinished > 0 && (
          <p className={styles.warning}>
            ⚠️ {unfinished} elevi din listă nu sunt încă notați complet.
          </p>
        )}
        <div className={styles.exportButtons}>
          <button
            className={styles.excelButton}
            onClick={() => doExport("excel")}
            disabled={visible.length === 0 || exportCols.length === 0}
          >
            📥 Descarcă Excel
          </button>
          <button
            className={styles.pdfButton}
            onClick={() => doExport("pdf")}
            disabled={visible.length === 0 || exportCols.length === 0}
          >
            📄 Descarcă PDF
          </button>
        </div>
      </div>

      {/* ștergerea tuturor notelor */}
      <div className={styles.dangerPanel}>
        <div>
          <h2 className={styles.dangerTitle}>🧹 Pornește notarea de la zero</h2>
          <p className={styles.dangerText}>
            Șterge <b>toate notele</b> ({gradedCount} {gradedCount === 1 ? "elev notat" : "elevi notați"}), deci și
            mediile, premiile și bifele de absent. Elevii, codurile și repartizarea rămân neatinse.
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
