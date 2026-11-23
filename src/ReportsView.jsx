// Situații pentru raportare: rezultatele pe clase (suma descrescător), școlile și profesorii participanți.
import React, { useEffect, useState } from "react";
import { loadHeader } from "./contestData";
import { editionLine } from "./roomLists";
import { exportReportExcel, loadReportData, printReportPdf } from "./reportLists";
import base from "./AttendanceView.module.css";
import styles from "./ReportsView.module.css";

export default function ReportsView({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const header = loadHeader();

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await loadReportData());
    } catch (err) {
      console.error("Eroare la încărcarea situațiilor:", err);
      setError("Datele nu au putut fi citite. Verificați conexiunea și încercați din nou.");
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

  const cards = data
    ? [
        {
          id: "rezultate",
          cls: styles.cResults,
          icon: "🏆",
          title: "Rezultatele pe clase",
          what: "Nume și prenume · Suma (descrescător) · Premiul · Școala · Profesorul",
          stat: `${data.presentCount} elevi prezenți`,
          note: data.absentCount ? `${data.absentCount} absenți nu apar` : "",
        },
        {
          id: "scoli",
          cls: styles.cSchools,
          icon: "🏛️",
          title: "Școlile participante",
          what: "Fiecare școală o singură dată · localitate, județ, elevi înscriși / prezenți, profesori",
          stat: `${data.schools.length} școli`,
          note: `${data.localities} localități · ${data.counties} județe`,
        },
        {
          id: "profesori",
          cls: styles.cTeachers,
          icon: "👩‍🏫",
          title: "Profesorii îndrumători",
          what: "Fiecare profesor o singură dată · nume și prenume, școala, telefon, email",
          stat: `${data.teachers.length} profesori`,
          note: `${data.teachers.filter((t) => !t.email).length} fără email · ${
            data.teachers.filter((t) => !t.telefon).length
          } fără telefon`,
        },
      ]
    : [];

  return (
    <div className={base.backdrop} onClick={onClose}>
      <div className={base.panel} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Situații pentru raportare">
        <div className={`${base.hero} ${styles.hero}`}>
          <div>
            <div className={base.kicker}>Misterele Matematicii · {editionLine(header)}</div>
            <h2 className={base.title}>📦 Situații pentru raportare</h2>
            <div className={base.sub}>
              Listele cerute de inspectorat și parteneri, cu antetul concursului — PDF de tipărit sau Excel de trimis.
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

        {loading && <div className={base.loading}>Se adună datele...</div>}
        {error && <div className={base.error}>⚠️ {error}</div>}

        {!loading && data && (
          <>
            {data.ungradedCount > 0 && (
              <p className={base.warn}>
                ⚠️ {data.ungradedCount} elevi nu au nicio notă și nici bifa „absent”: NU sunt numărați ca prezenți
                și nu apar în liste. Bifați-i absenți la Notare (sau treceți-le notele), apoi actualizați.
              </p>
            )}
            {data.incomplete > 0 && (
              <p className={base.warn}>
                ⚠️ {data.incomplete} elevi prezenți nu sunt notați complet: apar la finalul clasei lor, cu „—” la sumă.
              </p>
            )}
            <div className={styles.cards}>
              {cards.map((c) => (
                <div key={c.id} className={`${styles.card} ${c.cls}`}>
                  <div className={styles.cardTop}>
                    <span className={styles.icon}>{c.icon}</span>
                    <div>
                      <div className={styles.cardTitle}>{c.title}</div>
                      <div className={styles.stat}>{c.stat}</div>
                    </div>
                  </div>
                  <div className={styles.what}>{c.what}</div>
                  {c.note && <div className={styles.note}>{c.note}</div>}
                  <div className={styles.btns}>
                    <button onClick={() => printReportPdf(c.id, data, header)}>📄 PDF</button>
                    <button onClick={() => exportReportExcel([c.id], data, header)}>📥 Excel</button>
                  </div>
                </div>
              ))}
            </div>
            <div className={base.downloads}>
              <button
                className={base.xlsBtn}
                onClick={() =>
                  exportReportExcel(["rezultate", "scoli", "profesori"], data, header, "Situatii_Misterele_Matematicii")
                }
              >
                📚 Toate cele 3 situații într-un singur Excel (câte o foaie)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
