// Borderouri de corectare: pe fiecare clasă și subiect, doar lucrările elevilor prezenți.
import React, { useEffect, useState } from "react";
import { CLASS_ORDER } from "./allocation";
import { loadHeader } from "./contestData";
import { loadPresence } from "./presenceData";
import { editionLine } from "./roomLists";
import { papersOfClass, printBorderouri, SUBJECT_NAMES } from "./borderouri";
import base from "./AttendanceView.module.css";
import styles from "./BorderouriView.module.css";

const THEME = {
  "a IV-a": { cls: "c4", roman: "IV" },
  "a V-a": { cls: "c5", roman: "V" },
  "a VI-a": { cls: "c6", roman: "VI" },
  "a VII-a": { cls: "c7", roman: "VII" },
};
const fileClass = (c) => c.replace(/\s+/g, "_");

export default function BorderouriView({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pres, setPres] = useState(null);
  const header = loadHeader();

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setPres(await loadPresence());
    } catch (err) {
      console.error("Eroare la încărcarea prezenței:", err);
      setError("Datele nu au putut fi citite. Încercați din nou.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const classes = pres
    ? [...new Set([...CLASS_ORDER, ...pres.students.map((s) => s.clasa)])]
        .map((clasa) => ({
          clasa,
          papers: papersOfClass(pres.students, clasa),
          absent: pres.students.filter((s) => s.clasa === clasa && s.absent).length,
        }))
        .filter((c) => c.papers.length + c.absent > 0)
    : [];
  const totalPapers = classes.reduce((n, c) => n + c.papers.length, 0);
  const withoutCode = pres ? pres.students.filter((s) => !s.absent && !s.cod).length : 0;

  const download = (list, subjects, label) =>
    printBorderouri({
      classes: list.map(({ clasa, papers }) => ({ clasa, papers })),
      subjects,
      header,
      fileLabel: label,
    });

  return (
    <div className={base.backdrop} onClick={onClose}>
      <div className={base.panel} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Borderouri de corectare">
        <div className={`${base.hero} ${styles.hero}`}>
          <div>
            <div className={base.kicker}>Misterele Matematicii · {editionLine(header)}</div>
            <h2 className={base.title}>📝 Borderouri de corectare</h2>
            <div className={base.sub}>
              Câte un borderou individual pe clasă și subiect, doar cu lucrările <b>elevilor prezenți</b> (în ordinea
              codurilor).
            </div>
          </div>
          <div className={base.heroActions}>
            <button className={base.ghostBtn} onClick={load} disabled={loading}>
              🔄 Actualizează
            </button>
            {onClose && (
              <button className={base.ghostBtn} onClick={onClose}>
                ✖ Închide
              </button>
            )}
          </div>
        </div>

        {loading && <div className={base.loading}>Se pregătesc borderourile...</div>}
        {error && <div className={base.error}>⚠️ {error}</div>}

        {!loading && pres && (
          <>
            <div className={styles.summary}>
              <div>
                <b>{totalPapers}</b> lucrări de corectat
              </div>
              <div>
                <b>{classes.reduce((n, c) => n + c.absent, 0)}</b> absenți (nu apar pe borderouri)
              </div>
            </div>

            {pres.absentCount === 0 && (
              <p className={base.warn}>
                ⚠️ Nu este bifat niciun absent. Bifați absenții la <b>Notare</b> înainte de a tipări borderourile,
                altfel apar și lucrările lor.
              </p>
            )}
            {withoutCode > 0 && (
              <p className={base.warn}>
                ⚠️ {withoutCode} {withoutCode === 1 ? "elev prezent nu are" : "elevi prezenți nu au"} cod de
                anonimizare — dați codurile din pagina Coduri.
              </p>
            )}

            <div className={`${base.classGrid} ${styles.grid}`}>
              {classes.map((c) => {
                const theme = THEME[c.clasa] || { cls: "cX", roman: "" };
                return (
                  <div key={c.clasa} className={`${base.classCard} ${base[theme.cls]}`}>
                    <span className={base.roman} aria-hidden="true">
                      {theme.roman}
                    </span>
                    <div className={base.className}>Clasa {c.clasa}</div>
                    <div className={base.classBig}>
                      <b>{c.papers.length}</b> lucrări
                    </div>
                    <div className={styles.absNote}>
                      {c.absent > 0 ? `${c.absent} ${c.absent === 1 ? "absent" : "absenți"} — nu apar` : "toți prezenți"}
                    </div>
                    <div className={styles.subjButtons}>
                      {SUBJECT_NAMES.map((sub) => (
                        <button
                          key={sub}
                          className={styles.subjBtn}
                          disabled={c.papers.length === 0}
                          onClick={() => download([c], [sub], `Borderou_${fileClass(c.clasa)}_Subiectul_${sub}`)}
                          title={`Borderoul individual pentru subiectul ${sub}, clasa ${c.clasa}`}
                        >
                          <small>Subiectul</small>
                          <b>{sub}</b>
                        </button>
                      ))}
                    </div>
                    <button
                      className={styles.allBtn}
                      disabled={c.papers.length === 0}
                      onClick={() => download([c], SUBJECT_NAMES, `Borderouri_${fileClass(c.clasa)}_toate_subiectele`)}
                    >
                      📚 Toate cele 3 subiecte
                    </button>
                  </div>
                );
              })}
            </div>

            <div className={base.downloads}>
              <button
                className={base.pdfBtn}
                disabled={totalPapers === 0}
                onClick={() => download(classes, SUBJECT_NAMES, "Borderouri_toate_clasele")}
              >
                🗂️ Toate borderourile (toate clasele, toate subiectele)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
