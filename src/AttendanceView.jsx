// Prezența la concurs: înscriși, repartizați, prezenți, absenți, veniți pe loc — total și pe clase.
// Se încarcă singură (elevi + repartizarea salvată + bifele „absent” de la Notare), deci se poate
// deschide din orice pagină. Descărcare: raport PDF cu antetul concursului + Excel.
import React, { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { allocateKeepingCodes, CLASS_ORDER, sortRooms } from "./allocation";
import { loadAllocation } from "./allocationStore";
import { loadContestStudents, loadHeader } from "./contestData";
import { GRADES_COLLECTION, nameGradeId } from "./grading";
import { editionLine } from "./roomLists";
import { displayName } from "./nameFormat";
import { buildAttendance, exportAttendanceExcel, printAttendancePdf } from "./attendanceReport";
import styles from "./AttendanceView.module.css";

const THEME = {
  "a IV-a": { cls: "c4", roman: "IV" },
  "a V-a": { cls: "c5", roman: "V" },
  "a VI-a": { cls: "c6", roman: "VI" },
  "a VII-a": { cls: "c7", roman: "VII" },
};
const pctNum = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const fmtPct = (a, b) => `${String(pctNum(a, b)).replace(".", ",")}%`;

// inel de progres (procentul de prezență)
function Ring({ value, size = 92, stroke = 9, light = false }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className={styles.ring} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className={light ? styles.ringBgLight : styles.ringBg} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={stroke}
        className={light ? styles.ringFgLight : styles.ringFg}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(100, value) / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className={styles.ringText}>
        {String(value).replace(".", ",")}%
      </text>
    </svg>
  );
}

export default function AttendanceView({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [registered, setRegistered] = useState({ total: 0, byClass: {} });
  const [openClass, setOpenClass] = useState(null);
  const [stamp, setStamp] = useState("");
  const header = loadHeader();

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [data, roomsSnap, saved, gradesSnap] = await Promise.all([
        loadContestStudents(),
        getDocs(collection(db, "rooms")),
        loadAllocation(),
        getDocs(collection(db, GRADES_COLLECTION)),
      ]);
      const rooms = sortRooms(roomsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      const placed = allocateKeepingCodes(data.students, rooms, {
        saved: saved?.assignments || new Map(),
        placeNew: false,
      }).data;
      const absentIds = new Set(gradesSnap.docs.filter((d) => d.data().absent).map((d) => d.id));
      const walkIns = new Map((saved?.walkIns || []).map((w) => [w.id, w]));
      const marked = placed.map((s) => ({
        ...s,
        absent: (s.cod && absentIds.has(s.cod)) || absentIds.has(nameGradeId(s)),
        walkIn: walkIns.has(s.id),
        inLocul: walkIns.get(s.id)?.inLocul || null,
      }));
      const byClass = {};
      data.students.forEach((s) => (byClass[s.clasa] = (byClass[s.clasa] || 0) + 1));
      setRegistered({ total: data.students.length, byClass });
      setReport(buildAttendance(marked, rooms, { registered: byClass, registeredTotal: data.students.length }));
      setStamp(new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" }));
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

  const classes = report
    ? [...new Set([...CLASS_ORDER.filter((c) => registered.byClass[c]), ...report.byClass.map((t) => t.key)])]
    : [];
  const tallyOf = (c) => report.byClass.find((t) => t.key === c) || { total: 0, prezenti: 0, absenti: 0, veniti: 0 };
  const unplaced = report ? Math.max(0, registered.total - report.total) : 0;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Prezența la concurs">
        <div className={styles.hero}>
          <div>
            <div className={styles.kicker}>Misterele Matematicii · {editionLine(header)}</div>
            <h2 className={styles.title}>📊 Prezența la concurs</h2>
            <div className={styles.sub}>
              Absenții se bifează la <b>Notare</b>. {stamp && <>Actualizat la {stamp}.</>}
            </div>
          </div>
          <div className={styles.heroActions}>
            <button className={styles.ghostBtn} onClick={load} disabled={loading}>
              🔄 Actualizează
            </button>
            {onClose && (
              <button className={styles.ghostBtn} onClick={onClose}>
                ✖ Închide
              </button>
            )}
          </div>
        </div>

        {loading && <div className={styles.loading}>Se calculează prezența...</div>}
        {error && <div className={styles.error}>⚠️ {error}</div>}

        {!loading && report && (
          <>
            <div className={styles.kpis}>
              <div className={`${styles.kpi} ${styles.kpiSlate}`}>
                <span className={styles.kpiIcon}>📝</span>
                <span className={styles.kpiLabel}>Înscriși</span>
                <b className={styles.kpiValue}>{registered.total}</b>
                <span className={styles.kpiNote}>{report.total} cu sală</span>
              </div>
              <div className={`${styles.kpi} ${styles.kpiGreen}`}>
                <Ring value={pctNum(report.prezenti, report.total)} size={78} stroke={8} light />
                <div>
                  <span className={styles.kpiLabel}>Prezenți</span>
                  <b className={styles.kpiValue}>{report.prezenti}</b>
                  <span className={styles.kpiNote}>din {report.total} repartizați</span>
                </div>
              </div>
              <div className={`${styles.kpi} ${styles.kpiRed}`}>
                <span className={styles.kpiIcon}>🚫</span>
                <span className={styles.kpiLabel}>Absenți</span>
                <b className={styles.kpiValue}>{report.absenti}</b>
                <span className={styles.kpiNote}>{fmtPct(report.absenti, report.total)}</span>
              </div>
              <div className={`${styles.kpi} ${styles.kpiAmber}`}>
                <span className={styles.kpiIcon}>🪑</span>
                <span className={styles.kpiLabel}>Veniți pe loc</span>
                <b className={styles.kpiValue}>{report.veniti}</b>
                <span className={styles.kpiNote}>incluși la prezenți</span>
              </div>
            </div>

            {unplaced > 0 && (
              <p className={styles.warn}>
                ⚠️ {unplaced} {unplaced === 1 ? "elev înscris nu are" : "elevi înscriși nu au"} încă sală (nu intră
                în calculul prezenței). Așezați-i din Repartizare.
              </p>
            )}

            <h3 className={styles.section}>Pe clase</h3>
            <div className={styles.classGrid}>
              {classes.map((c) => {
                const t = tallyOf(c);
                const theme = THEME[c] || { cls: "cX", roman: "" };
                const list = report.classLists.find((x) => x.clasa === c)?.students || [];
                const abs = list.filter((s) => s.absent);
                const isOpen = openClass === c;
                return (
                  <div key={c} className={`${styles.classCard} ${styles[theme.cls]}`}>
                    <span className={styles.roman} aria-hidden="true">
                      {theme.roman}
                    </span>
                    <div className={styles.classHead}>
                      <div>
                        <div className={styles.className}>Clasa {c}</div>
                        <div className={styles.classBig}>
                          <b>{t.prezenti}</b> prezenți
                        </div>
                      </div>
                      <Ring value={pctNum(t.prezenti, t.total)} light />
                    </div>
                    <div className={styles.classStats}>
                      <span>
                        📝 Înscriși <b>{registered.byClass[c] || 0}</b>
                      </span>
                      <span>
                        🚫 Absenți <b>{t.absenti}</b>
                      </span>
                      <span>
                        🪑 Veniți pe loc <b>{t.veniti}</b>
                      </span>
                    </div>
                    <div className={styles.bar}>
                      <div style={{ width: `${pctNum(t.prezenti, t.total)}%` }} />
                    </div>
                    {abs.length > 0 && (
                      <button className={styles.absToggle} onClick={() => setOpenClass(isOpen ? null : c)}>
                        {isOpen ? "▾ Ascunde absenții" : `▸ Vezi absenții (${abs.length})`}
                      </button>
                    )}
                    {isOpen && (
                      <ul className={styles.absList}>
                        {abs.map((s) => (
                          <li key={s.id}>
                            <b>{s.cod}</b> {displayName(s.nume)} <span>· {s.sala}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            <div className={styles.downloads}>
              <button className={styles.pdfBtn} onClick={() => printAttendancePdf(report, header)}>
                📄 Descarcă raportul de prezență (PDF)
              </button>
              <button className={styles.xlsBtn} onClick={() => exportAttendanceExcel(report, header)}>
                📥 Excel (câte o foaie pe clasă)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
