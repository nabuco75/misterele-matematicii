// Căutare globală profesori îndrumători și elevi: găsește un profesor după orice știți despre el
// (nume, email, telefon, școală, localitate, județ sau numele unui elev înscris de el), îl corectează
// în toate înscrierile lui și permite corectarea / scoaterea elevilor din fiecare înscriere.
import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, query, runTransaction, where, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import styles from "./TeacherSearch.module.css";
import {
  cleanTeacherName,
  plainText,
  searchTeachers,
  teacherKey,
  validateStudentName,
  validateTeacher,
} from "./teachers";
import { applyRemovals, applyRenames } from "./studentSync";

const MAX_RESULTS = 40;

// unde se caută; „Oriunde” arată întâi potrivirile pe numele profesorului, apoi restul, separat
const FIELDS = [
  { id: "all", label: "Oriunde" },
  { id: "nume", label: "Nume profesor" },
  { id: "contact", label: "Email / telefon" },
  { id: "elev", label: "Elev" },
  { id: "scoala", label: "Școală / localitate" },
];
const FOUND_IN = {
  contact: "email / telefon",
  elev: "numele unui elev",
  scoala: "școală / localitate",
  combinat: "mai multe câmpuri",
};

// un caracter fără diacritice și cu literă mică (păstrează lungimea textului, pentru evidențiere)
const plainChar = (c) => c.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() || c;

// evidențiază cuvintele căutate în text, fără să țină cont de diacritice sau litere mari
function Highlight({ text, words }) {
  const str = String(text || "");
  if (!words?.length || !str) return str;
  const plain = [...str].map(plainChar).join("");
  if (plain.length !== str.length) return str;
  const marks = new Array(str.length).fill(false);
  words.forEach((w) => {
    let i = plain.indexOf(w);
    while (w && i !== -1) {
      for (let k = i; k < i + w.length; k++) marks[k] = true;
      i = plain.indexOf(w, i + w.length);
    }
  });
  const parts = [];
  let start = 0;
  for (let i = 1; i <= str.length; i++) {
    if (i === str.length || marks[i] !== marks[start]) {
      const piece = str.slice(start, i);
      parts.push(marks[start] ? <mark key={start}>{piece}</mark> : piece);
      start = i;
    }
  }
  return <>{parts}</>;
}

const studentName = (st) => (typeof st === "string" ? st : st?.nume || "");

// cel mai des întâlnit text nevid dintr-o listă (pentru valorile propuse la editare)
const mostCommon = (values) => {
  const counts = new Map();
  values.filter(Boolean).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
};

function TeacherSearch({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [regs, setRegs] = useState([]);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [field, setField] = useState("all");
  const [showOther, setShowOther] = useState(false);
  const [edit, setEdit] = useState(null); // { key, nume, email, telefon, initialEmail, initialTelefon, selected: Set }
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  // editarea elevilor unei înscrieri: { regId, rows: [{ orig, nume, removed }] }
  const [studentsEdit, setStudentsEdit] = useState(null);
  const [studentsError, setStudentsError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [schoolsSnap, regsSnap] = await Promise.all([
        getDocs(collection(db, "schools")),
        getDocs(collection(db, "registration")),
      ]);
      const schools = {};
      schoolsSnap.forEach((d) => (schools[d.id] = d.data()));
      const list = regsSnap.docs.map((d) => {
        const r = d.data();
        const sc = schools[r.schoolId] || {};
        const students = (Array.isArray(r.students) ? r.students : []).map(studentName).filter(Boolean);
        return {
          id: d.id,
          profesor: r.profesorIndrumatorEmail || "",
          email: r.profesorEmail || "",
          telefon: r.telefon || "",
          clasa: r.class || "",
          scoala: sc.name || r.school || "Școală necunoscută",
          localitate: sc.locality || "",
          judet: sc.county || "",
          students,
        };
      });
      setRegs(list);
    } catch (err) {
      console.error("Eroare la citirea înscrierilor:", err);
      setMessage({ type: "error", text: "❌ Înscrierile nu au putut fi citite." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // profesorii, grupați după nume (fără diacritice, majuscule, cratime sau ordinea cuvintelor)
  const teachers = useMemo(() => {
    const map = new Map();
    regs.forEach((r) => {
      const key = teacherKey(r.profesor) || `fara-nume-${r.id}`;
      if (!map.has(key)) map.set(key, { key, regs: [] });
      map.get(key).regs.push(r);
    });
    return [...map.values()]
      .map((t) => {
        const variants = [...new Set(t.regs.map((r) => r.profesor.trim()).filter(Boolean))];
        return {
          ...t,
          nume: mostCommon(t.regs.map((r) => r.profesor.trim())) || "(fără nume)",
          variants,
          email: mostCommon(t.regs.map((r) => r.email)),
          telefon: mostCommon(t.regs.map((r) => r.telefon)),
          students: t.regs.reduce((n, r) => n + r.students.length, 0),
          schools: [...new Set(t.regs.map((r) => r.scoala))],
        };
      })
      .sort((a, b) => a.nume.localeCompare(b.nume, "ro", { sensitivity: "base" }));
  }, [regs]);

  const words = useMemo(() => plainText(search).split(" ").filter(Boolean), [search]);

  const results = useMemo(() => searchTeachers(teachers, search, field), [search, field, teachers]);

  // elevii găsiți direct după nume (fiecare cu butonul lui de editare)
  const studentHits = useMemo(() => {
    if (words.length === 0 || (field !== "all" && field !== "elev")) return [];
    const out = [];
    regs.forEach((r) =>
      r.students.forEach((nume, idx) => {
        const p = plainText(nume);
        if (words.every((w) => p.includes(w))) out.push({ r, idx, nume });
      })
    );
    return out.sort((a, b) => a.nume.localeCompare(b.nume, "ro", { sensitivity: "base" }));
  }, [regs, words, field]);

  // în modul „Oriunde”: întâi profesorii al căror nume se potrivește, apoi (separat) celelalte potriviri
  const mainResults = results ? (field === "all" ? results.filter((t) => t.tier === 0) : results) : null;
  const otherResults = results && field === "all" ? results.filter((t) => t.tier > 0) : [];

  const duplicates = teachers.filter((t) => t.variants.length > 1);

  // ====== ELEVII UNEI ÎNSCRIERI ======
  const openStudents = (r) => {
    setStudentsEdit({ regId: r.id, rows: r.students.map((nume) => ({ orig: nume, nume, removed: false })) });
    setStudentsError("");
    setMessage(null);
  };

  const openStudent = (r, idx) => {
    setStudentsEdit({
      regId: r.id,
      single: idx,
      rows: r.students.map((nume) => ({ orig: nume, nume, removed: false })),
    });
    setStudentsError("");
    setMessage(null);
  };

  const updateRow = (i, patch) => {
    setStudentsEdit((prev) => ({
      ...prev,
      rows: prev.rows.map((row, k) => (k === i ? { ...row, ...patch } : row)),
    }));
    setStudentsError("");
  };

  const handleSaveStudents = async (r) => {
    const rows = studentsEdit.rows.map((row) => ({ ...row, nume: cleanTeacherName(row.nume) }));
    for (const row of rows) {
      if (row.removed) continue;
      const err = validateStudentName(row.nume);
      if (err) {
        setStudentsError(`„${row.nume || row.orig}”: ${err}`);
        return;
      }
    }
    const kept = rows.filter((row) => !row.removed);
    const seen = new Set();
    for (const row of kept) {
      const k = plainText(row.nume);
      if (seen.has(k)) {
        setStudentsError(`„${row.nume}” apare de două ori în aceeași înscriere.`);
        return;
      }
      seen.add(k);
    }
    const renames = kept.filter((row) => row.nume !== row.orig);
    const removed = rows.filter((row) => row.removed);
    if (renames.length === 0 && removed.length === 0) {
      setStudentsError("Nu ați modificat nimic.");
      return;
    }
    const lines = [
      ...renames.map((row) => `✏️ „${row.orig}” → „${row.nume}” (își păstrează sala, codul și notele)`),
      ...removed.map((row) => `🗑️ „${row.orig}” — scos din concurs (se eliberează locul; codul devine retras)`),
      kept.length === 0 ? "\n⚠️ Nu mai rămâne niciun elev: înscrierea va fi ștearsă." : "",
    ].filter(Boolean);
    if (!window.confirm(`${r.scoala} — clasa ${r.clasa}\n\nSalvați modificările?\n\n${lines.join("\n")}`)) return;

    setSaving(true);
    try {
      const regRef = doc(db, "registration", r.id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(regRef);
        if (!snap.exists()) throw new Error("STALE");
        const arr = Array.isArray(snap.data().students) ? snap.data().students : [];
        const names = arr.map((st) => (typeof st === "string" ? st : st?.nume || ""));
        // siguranță: lista din baza de date trebuie să fie cea afișată
        if (names.length !== rows.length || names.some((n, i) => n !== rows[i].orig)) throw new Error("STALE");
        const next = arr
          .map((st, i) =>
            rows[i].removed ? null : typeof st === "object" && st ? { ...st, nume: rows[i].nume } : rows[i].nume
          )
          .filter((st) => st !== null);
        if (next.length === 0) tx.delete(regRef);
        else tx.update(regRef, { students: next });
      });

      // elevii redenumiți își păstrează sala, codul și notele; cei scoși eliberează locul
      let note = "";
      try {
        const rn = await applyRenames(renames.map((row) => ({ regId: r.id, oldName: row.orig, newName: row.nume })));
        const rm = await applyRemovals(removed.map((row) => ({ regId: r.id, nume: row.orig })));
        const kept2 = [rn.seats && `sala (${rn.seats})`, rn.codes && `codul (${rn.codes})`, rn.grades && `notele (${rn.grades})`].filter(Boolean);
        if (kept2.length) note += ` Elevii redenumiți și-au păstrat ${kept2.join(", ")}.`;
        if (rn.codes) note += ` Bilețelul cu numele nou: Coduri › „✏️ Nume corectate” › ✂️ Bilețel nou.`;
        if (rm.seats || rm.codes) note += ` Locuri eliberate: ${rm.seats}.`;
      } catch (syncErr) {
        console.error("Eroare la actualizarea repartizării/codurilor:", syncErr);
        note = " ⚠️ Repartizarea/codurile nu s-au actualizat — confirmați numele corectate în pagina Repartizare.";
      }

      setStudentsEdit(null);
      setMessage({
        type: "success",
        text: `✅ Elevii au fost actualizați (${r.scoala}, clasa ${r.clasa}): ${renames.length} corectați, ${removed.length} scoși.${note}`,
      });
      await load();
    } catch (e) {
      console.error("Eroare la salvarea elevilor:", e);
      setStudentsError(
        e?.message === "STALE"
          ? "Lista de elevi s-a schimbat între timp. Închideți, căutați din nou și reîncercați."
          : "Modificările nu au putut fi salvate. Încercați din nou."
      );
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (t) => {
    setEdit({
      key: t.key,
      nume: t.variants.length > 1 ? t.nume : t.variants[0] || "",
      email: t.email,
      telefon: t.telefon,
      initialEmail: t.email,
      initialTelefon: t.telefon,
      selected: new Set(t.regs.map((r) => r.id)),
    });
    setEditError("");
    setMessage(null);
  };

  const toggleReg = (id) =>
    setEdit((prev) => {
      const selected = new Set(prev.selected);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      return { ...prev, selected };
    });

  const handleSave = async (t) => {
    const err = validateTeacher(edit);
    if (err) {
      setEditError(err);
      return;
    }
    const targets = t.regs.filter((r) => edit.selected.has(r.id));
    if (targets.length === 0) {
      setEditError("Bifați cel puțin o înscriere.");
      return;
    }
    const nume = cleanTeacherName(edit.nume);
    const email = edit.email.trim();
    const telefon = edit.telefon.trim();
    // emailul și telefonul se scriu doar dacă au fost modificate (altfel păstrăm ce are fiecare înscriere)
    const changeEmail = email !== edit.initialEmail;
    const changeTelefon = telefon !== edit.initialTelefon;
    const lines = [
      `Nume: „${nume}”`,
      changeEmail && `Email: ${email || "(gol)"}`,
      changeTelefon && `Telefon: ${telefon || "(gol)"}`,
      "",
      `Pentru ${targets.length} ${targets.length === 1 ? "înscriere" : "înscrieri"}:`,
      ...targets.map((r) => `• ${r.scoala}${r.localitate ? `, ${r.localitate}` : ""} — clasa ${r.clasa} (${r.students.length} elevi)`),
      "",
      "Numele nou va apărea pe listele din săli, pe borderouri și la note.",
    ].filter((x) => x !== false);
    if (!window.confirm(`Salvați modificările?\n\n${lines.join("\n")}`)) return;

    setSaving(true);
    try {
      const batch = writeBatch(db);
      targets.forEach((r) => {
        const data = { profesorIndrumatorEmail: nume };
        if (changeEmail) data.profesorEmail = email;
        if (changeTelefon) data.telefon = telefon;
        batch.update(doc(db, "registration", r.id), data);
      });
      // codurile de anonimizare păstrează și ele numele profesorului (pentru borderou)
      for (const r of targets) {
        const codesSnap = await getDocs(query(collection(db, "codes"), where("regId", "==", r.id)));
        codesSnap.forEach((c) => batch.update(c.ref, { profesor: nume }));
      }
      await batch.commit();
      setEdit(null);
      setMessage({
        type: "success",
        text: `✅ Profesorul „${nume}” a fost actualizat în ${targets.length} ${
          targets.length === 1 ? "înscriere" : "înscrieri"
        }.`,
      });
      await load();
    } catch (e) {
      console.error("Eroare la salvarea profesorului:", e);
      setEditError("Modificările nu au putut fi salvate. Încercați din nou.");
    } finally {
      setSaving(false);
    }
  };

  const renderTeacher = (t, hits) => {
    const isEditing = edit?.key === t.key;
    return (
      <div key={t.key} className={`${styles.card} ${isEditing ? styles.cardEditing : ""}`}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.name}>
              👩‍🏫 <Highlight text={t.nume} words={words} />
            </div>
            {t.reasons && t.reasons.some((r) => r !== "nume") && (
              <div className={styles.reasons}>
                găsit în:{" "}
                {t.reasons
                  .filter((r) => r !== "nume")
                  .map((r) => (
                    <span key={r} className={styles.reasonChip}>
                      {FOUND_IN[r]}
                    </span>
                  ))}
              </div>
            )}
            {t.variants.length > 1 && (
              <div className={styles.variants}>
                ⚠️ Scris în {t.variants.length} feluri: {t.variants.map((v) => `„${v}”`).join(", ")}
              </div>
            )}
            <div className={styles.contact}>
              ✉️ {t.email ? <Highlight text={t.email} words={words} /> : "fără email"} · 📞{" "}
              {t.telefon ? <Highlight text={t.telefon} words={words} /> : "fără telefon"}
            </div>
          </div>
          {!isEditing && (
            <button className={styles.editBtn} onClick={() => startEdit(t)}>
              ✏️ Editează
            </button>
          )}
        </div>

        <ul className={styles.regs}>
          {t.regs.map((r) => {
            const hit = hits?.find((h) => h.reg.id === r.id);
            return (
              <li key={r.id} className={hit ? styles.regHit : ""}>
                {isEditing && (
                  <input
                    type="checkbox"
                    checked={edit.selected.has(r.id)}
                    onChange={() => toggleReg(r.id)}
                    className={styles.regCheck}
                  />
                )}
                <span>
                  <b>
                    <Highlight text={r.scoala} words={words} />
                  </b>
                  {r.localitate && (
                    <>
                      , <Highlight text={r.localitate} words={words} />
                    </>
                  )}
                  {r.judet && (
                    <>
                      {" "}
                      (<Highlight text={r.judet} words={words} />)
                    </>
                  )}{" "}
                  — clasa {r.clasa}, {r.students.length}{" "}
                  {r.students.length === 1 ? "elev" : "elevi"}
                  {r.profesor.trim() !== t.nume && <span className={styles.spelling}> · scris „{r.profesor}”</span>}
                  {hit?.matchedStudents.length > 0 && (
                    <span className={styles.studentHit}>
                      {" "}
                      · elev:{" "}
                      {hit.matchedStudents.map((st, i) => (
                        <React.Fragment key={st}>
                          {i > 0 && ", "}
                          <Highlight text={st} words={words} />
                        </React.Fragment>
                      ))}
                    </span>
                  )}
                </span>
                {studentsEdit?.regId !== r.id && (
                  <button
                    className={styles.studentsBtn}
                    onClick={() => openStudents(r)}
                    disabled={saving}
                    title="Corectați numele elevilor sau scoateți un elev"
                  >
                    👥 Elevii ({r.students.length})
                  </button>
                )}
                {studentsEdit?.regId === r.id && studentsEdit.single === undefined && (
                  <div className={styles.studentsEditor}>
                    <div className={styles.studentsTitle}>
                      👥 Elevii înscriși — {r.scoala}, clasa {r.clasa}
                    </div>
                    {studentsEdit.rows.map((row, i) => (
                      <div
                        key={row.orig + i}
                        className={`${styles.studentRow} ${row.removed ? styles.studentRemoved : ""} ${
                          !row.removed && row.nume !== row.orig ? styles.studentChanged : ""
                        }`}
                      >
                        <span className={styles.studentNr}>{i + 1}.</span>
                        <input
                          type="text"
                          value={row.nume}
                          disabled={row.removed || saving}
                          onChange={(e) => updateRow(i, { nume: e.target.value })}
                          placeholder="Nume și prenume elev"
                        />
                        {row.removed ? (
                          <button className={styles.undoBtn} onClick={() => updateRow(i, { removed: false })}>
                            ↩️ Păstrează
                          </button>
                        ) : (
                          <button
                            className={styles.removeBtn}
                            onClick={() => updateRow(i, { removed: true, nume: row.orig })}
                            title="Scoate elevul din concurs"
                          >
                            🗑️
                          </button>
                        )}
                        {!row.removed && row.nume !== row.orig && (
                          <span className={styles.wasName}>era: „{row.orig}”</span>
                        )}
                        {row.removed && <span className={styles.wasName}>va fi scos</span>}
                      </div>
                    ))}
                    <p className={styles.formHint}>
                      Elevul redenumit își păstrează sala, codul de anonimizare și notele. Elevul scos își
                      eliberează locul din sală, iar codul lui nu se mai dă nimănui.
                    </p>
                    {studentsError && <p className={styles.error}>⚠️ {studentsError}</p>}
                    <div className={styles.actions}>
                      <button className={styles.saveBtn} onClick={() => handleSaveStudents(r)} disabled={saving}>
                        {saving ? "Se salvează..." : "💾 Salvează elevii"}
                      </button>
                      <button
                        className={styles.cancelBtn}
                        onClick={() => {
                          setStudentsEdit(null);
                          setStudentsError("");
                        }}
                        disabled={saving}
                      >
                        Renunță
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {isEditing && (
          <div className={styles.form}>
            <div className={styles.fields}>
              <label>
                Nume și prenume
                <input
                  type="text"
                  value={edit.nume}
                  onChange={(e) => {
                    setEdit((prev) => ({ ...prev, nume: e.target.value }));
                    setEditError("");
                  }}
                  placeholder="ex: Popescu Maria"
                  autoFocus
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={edit.email}
                  onChange={(e) => {
                    setEdit((prev) => ({ ...prev, email: e.target.value }));
                    setEditError("");
                  }}
                  placeholder="ex: maria.popescu@gmail.com"
                />
              </label>
              <label>
                Telefon
                <input
                  type="tel"
                  value={edit.telefon}
                  onChange={(e) => {
                    setEdit((prev) => ({ ...prev, telefon: e.target.value }));
                    setEditError("");
                  }}
                  placeholder="ex: 0740 123 456"
                />
              </label>
            </div>
            <p className={styles.formHint}>
              Modificarea se aplică înscrierilor bifate mai sus. Emailul și telefonul se schimbă doar dacă
              le modificați.
            </p>
            {editError && <p className={styles.error}>⚠️ {editError}</p>}
            <div className={styles.actions}>
              <button className={styles.saveBtn} onClick={() => handleSave(t)} disabled={saving}>
                {saving ? "Se salvează..." : "💾 Salvează"}
              </button>
              <button
                className={styles.cancelBtn}
                onClick={() => {
                  setEdit(null);
                  setEditError("");
                }}
                disabled={saving}
              >
                Renunță
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) return <div className={styles.panel}>Se încarcă profesorii îndrumători...</div>;

  const list = field === "elev" && results ? [] : mainResults ? mainResults : showAll ? teachers : [];
  const shown = list.slice(0, MAX_RESULTS);
  // „Alte potriviri” se deschide singur doar dacă nu s-a găsit nimic altceva
  const autoOpenOther = !!mainResults && mainResults.length === 0 && studentHits.length === 0;

  return (
    <div className={styles.panel}>
      {onClose && (
        <button type="button" className={styles.closeButton} onClick={onClose} title="Închide căutarea">
          ✖ Închide
        </button>
      )}
      <h2 className={styles.title}>🔎 Caută profesor sau elev</h2>
      <p className={styles.intro}>
        Scrieți orice știți: o parte din numele profesorului, emailul, telefonul, școala, localitatea,
        județul sau <b>numele unui elev</b> înscris de el. Nu contează diacriticele sau literele mari.
        Elevii găsiți apar primii, fiecare cu „Editează elevul”. Profesorul se corectează cu „Editează”.
      </p>

      <input
        type="search"
        className={styles.search}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="ex: leoreanu · gmail · 0740 · Moinești · Mereuta Delia"
        autoFocus
      />

      <div className={styles.fieldChips} role="group" aria-label="Unde se caută">
        <span className={styles.fieldLabel}>Caută în:</span>
        {FIELDS.map((f) => (
          <button
            key={f.id}
            className={`${styles.fieldChip} ${field === f.id ? styles.fieldChipActive : ""}`}
            onClick={() => {
              setField(f.id);
              setShowOther(false);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {message && (
        <p className={message.type === "success" ? styles.success : styles.error}>{message.text}</p>
      )}

      {!results && (
        <div className={styles.summary}>
          <span>
            <b>{teachers.length}</b> profesori îndrumători în <b>{regs.length}</b> înscrieri.
          </span>
          <button className={styles.linkBtn} onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Ascunde lista" : "Arată toți profesorii"}
          </button>
        </div>
      )}

      {!results && duplicates.length > 0 && (
        <div className={styles.dupBox}>
          <b>⚠️ {duplicates.length} profesori scriși în mai multe feluri</b> (de ex. cu/fără diacritice,
          cratimă sau alt ordin al numelor). Apăsați „Editează” ca să unificați numele:
          <div className={styles.dupList}>{duplicates.map((t) => renderTeacher(t))}</div>
        </div>
      )}

      {studentHits.length > 0 && (
        <div className={styles.studentResults}>
          <p className={styles.count}>
            🎓 <b>{studentHits.length}</b> {studentHits.length === 1 ? "elev găsit" : "elevi găsiți"}
            {studentHits.length > MAX_RESULTS && ` — se afișează primii ${MAX_RESULTS}; scrieți mai mult din nume`}
          </p>
          {studentHits.slice(0, MAX_RESULTS).map(({ r, idx, nume }) => {
            const editing = studentsEdit?.regId === r.id && studentsEdit.single === idx;
            const row = editing ? studentsEdit.rows[idx] : null;
            return (
              <div key={r.id + "-" + idx} className={`${styles.studentCard} ${editing ? styles.cardEditing : ""}`}>
                <div className={styles.studentCardHead}>
                  <div>
                    <div className={styles.studentCardName}>
                      🎓 <Highlight text={nume} words={words} />
                    </div>
                    <div className={styles.studentCardMeta}>
                      clasa <b>{r.clasa}</b> · {r.scoala}
                      {r.localitate && `, ${r.localitate}`} · prof. {r.profesor || "—"}
                    </div>
                  </div>
                  {!editing && (
                    <button className={styles.editBtn} onClick={() => openStudent(r, idx)} disabled={saving}>
                      ✏️ Editează elevul
                    </button>
                  )}
                </div>
                {editing && (
                  <div className={styles.singleEditor}>
                    <input
                      type="text"
                      value={row.nume}
                      disabled={row.removed || saving}
                      onChange={(e) => updateRow(idx, { nume: e.target.value })}
                      placeholder="Nume și prenume elev"
                      autoFocus
                    />
                    {row.removed && (
                      <p className={styles.error}>
                        🗑️ Elevul va fi scos din concurs (se eliberează locul din sală; codul nu se mai dă nimănui).
                      </p>
                    )}
                    {!row.removed && row.nume !== row.orig && (
                      <p className={styles.formHint}>
                        era: „{row.orig}” — își păstrează sala, codul și notele.
                      </p>
                    )}
                    {studentsError && <p className={styles.error}>⚠️ {studentsError}</p>}
                    <div className={styles.actions}>
                      <button className={styles.saveBtn} onClick={() => handleSaveStudents(r)} disabled={saving}>
                        {saving ? "Se salvează..." : "💾 Salvează"}
                      </button>
                      {row.removed ? (
                        <button className={styles.cancelBtn} onClick={() => updateRow(idx, { removed: false })}>
                          ↩️ Nu-l mai scoate
                        </button>
                      ) : (
                        <button
                          className={styles.removeBtn}
                          onClick={() => updateRow(idx, { removed: true, nume: row.orig })}
                          disabled={saving}
                        >
                          🗑️ Scoate din concurs
                        </button>
                      )}
                      <button
                        className={styles.cancelBtn}
                        onClick={() => {
                          setStudentsEdit(null);
                          setStudentsError("");
                        }}
                        disabled={saving}
                      >
                        Renunță
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {field === "elev" && results && studentHits.length === 0 && (
        <p className={styles.empty}>Niciun elev cu numele „{search}”.</p>
      )}

      {field !== "elev" && results && results.length === 0 && studentHits.length === 0 && (
        <p className={styles.empty}>
          Nu s-a găsit nimic pentru „{search}”
          {field !== "all" && ` în „${FIELDS.find((f) => f.id === field).label}”`}.
        </p>
      )}

      {field !== "elev" && results && results.length > 0 && (mainResults.length > 0 || studentHits.length === 0) && (
        <p className={styles.count}>
          {mainResults.length > 0 ? (
            <>
              <b>{mainResults.length}</b>{" "}
              {field === "all"
                ? mainResults.length === 1
                  ? "profesor cu acest nume"
                  : "profesori cu acest nume"
                : mainResults.length === 1
                ? "profesor găsit"
                : "profesori găsiți"}
              {mainResults.length > MAX_RESULTS && ` — se afișează primii ${MAX_RESULTS}; restrângeți căutarea`}
            </>
          ) : (
            "Niciun profesor cu acest nume."
          )}
        </p>
      )}

      {shown.map((t) => renderTeacher(t, t.hits))}

      {!results && list.length > MAX_RESULTS && (
        <p className={styles.count}>
          Se afișează primii {MAX_RESULTS} din {list.length}. Folosiți căutarea pentru ceilalți.
        </p>
      )}

      {field !== "elev" && otherResults.length > 0 && (
        <div className={styles.otherBox}>
          <button
            className={styles.otherToggle}
            onClick={() => setShowOther((v) => !v)}
            aria-expanded={showOther || autoOpenOther}
          >
            {showOther || autoOpenOther ? "▾" : "▸"} Alte potriviri: <b>{otherResults.length}</b>{" "}
            {otherResults.length === 1 ? "profesor" : "profesori"} la care „{search}” apare în email, telefon,
            numele unui elev sau al școlii
          </button>
          {(showOther || autoOpenOther) &&
            otherResults.slice(0, MAX_RESULTS).map((t) => renderTeacher(t, t.hits))}
        </div>
      )}
    </div>
  );
}

export default TeacherSearch;
