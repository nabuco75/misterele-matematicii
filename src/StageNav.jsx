// Etapele concursului: Săli → Repartizare → Coduri → Tipărire → Notare.
// - <StageCards onGo />            în panoul de admin: carduri mari, cu starea fiecărei etape
// - <StageBar current onGo onHome /> sus pe fiecare pagină de etapă: treci direct la altă etapă
// Starea se doar CITEȘTE din baza de date (nu se scrie nimic).
import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { loadContestStudents } from "./contestData";
import { loadAllocation } from "./allocationStore";
import { diffWithAllocation } from "./studentSync";
import { buildResults, GRADES_COLLECTION } from "./grading";
import styles from "./StageNav.module.css";

export const STAGES = [
  { id: "sali", icon: "🏫", label: "Săli", hint: "Sălile și locurile" },
  { id: "repartizare", icon: "🪑", label: "Repartizare", hint: "Elevii în săli" },
  { id: "coduri", icon: "🔐", label: "Coduri", hint: "Anonimizarea" },
  { id: "tiparire", icon: "🖨️", label: "Tipărire", hint: "Liste, bilețele, borderou" },
  { id: "notare", icon: "📝", label: "Notare", hint: "Note, sume, premii" },
];

export const STAGE_IDS = STAGES.map((s) => s.id);

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// starea fiecărei etapă: { [id]: { text, alert } }  (alert = e ceva de făcut acolo)
async function loadStageStatus() {
  const [roomsSnap, data, saved, gradesSnap] = await Promise.all([
    getDocs(collection(db, "rooms")),
    loadContestStudents(),
    loadAllocation(),
    getDocs(collection(db, GRADES_COLLECTION)),
  ]);
  const students = data.students;
  const rooms = roomsSnap.docs.map((d) => d.data());
  const seats = rooms.reduce((n, r) => n + (parseInt(r.seats, 10) || 0), 0);
  const status = {};

  status.sali = rooms.length
    ? { text: `${plural(rooms.length, "sală", "săli")} · ${seats} locuri` }
    : { text: "Nicio sală configurată", alert: true };

  const hasAlloc = !!(saved?.assignments && saved.assignments.size > 0);
  if (!hasAlloc) {
    status.repartizare = students.length
      ? { text: "Elevii nu sunt încă repartizați", alert: true }
      : { text: "Niciun elev înscris" };
  } else {
    const diff = diffWithAllocation(students, saved.assignments, data.orphans);
    const toCheck = diff.pairs.length + diff.unpairedGhosts.length;
    if (diff.realNew.length > 0) {
      status.repartizare = { text: plural(diff.realNew.length, "elev nou de repartizat", "elevi noi de repartizat"), alert: true };
    } else if (toCheck > 0) {
      status.repartizare = { text: plural(toCheck, "nume de verificat", "nume de verificat"), alert: true };
    } else {
      status.repartizare = { text: `${students.length} elevi au sală` };
    }
  }

  const withCode = students.filter((s) => s.cod).length;
  const withoutCode = students.length - withCode;
  if (withCode === 0) {
    status.coduri = { text: hasAlloc ? "Neanonimizat încă" : "—", alert: hasAlloc && students.length > 0 };
  } else if (withoutCode > 0) {
    status.coduri = { text: plural(withoutCode, "elev fără cod", "elevi fără cod"), alert: true };
  } else {
    status.coduri = { text: `${withCode} coduri date` };
  }

  // tranșele de coduri ale căror bilețele nu au fost descărcate
  const codesNow = new Set(students.filter((s) => s.cod).map((s) => s.cod));
  const listed = new Set((saved?.codeBatches || []).flatMap((b) => b.codes || []));
  const pending = (saved?.codeBatches || []).filter((b) => {
    if (b.printedAt) return false;
    const codes = b.codes ? b.codes : [...codesNow].filter((c) => !listed.has(c));
    return codes.some((c) => codesNow.has(c));
  }).length;
  if (!hasAlloc) status.tiparire = { text: "Întâi repartizarea" };
  else if (pending > 0) status.tiparire = { text: plural(pending, "tranșă de bilețele de tipărit", "tranșe de bilețele de tipărit"), alert: true };
  else status.tiparire = { text: "Liste și bilețele gata de descărcat" };

  const grades = {};
  gradesSnap.forEach((d) => (grades[d.id] = d.data()));
  const rows = buildResults(students, grades);
  const done = rows.filter((r) => r.stare === "notat" || r.stare === "absent").length;
  status.notare = { text: `${done} / ${students.length} elevi notați` };

  return status;
}

// carduri mari, în panoul de admin
export function StageCards({ onGo }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    loadStageStatus()
      .then((s) => alive && setStatus(s))
      .catch((err) => {
        console.error("Eroare la citirea stării etapelor:", err);
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className={styles.cardsSection}>
      <h2 className={styles.cardsTitle}>Etapele concursului</h2>
      <div className={styles.cards}>
        {STAGES.map((st, i) => {
          const s = status?.[st.id];
          return (
            <button key={st.id} className={`${styles.card} ${s?.alert ? styles.cardAlert : ""}`} onClick={() => onGo(st.id)}>
              <span className={styles.step}>{i + 1}</span>
              <span className={styles.cardIcon}>{st.icon}</span>
              <span className={styles.cardLabel}>{st.label}</span>
              <span className={styles.cardStatus}>
                {s ? (
                  <>
                    {s.alert && <span className={styles.dot} aria-hidden="true" />}
                    {s.text}
                  </>
                ) : error ? (
                  st.hint
                ) : (
                  <span className={styles.loadingText}>se încarcă…</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// bara de sus, pe paginile etapelor
export function StageBar({ current, onGo, onHome }) {
  return (
    <nav className={styles.bar} aria-label="Etapele concursului">
      {onHome && (
        <button className={styles.home} onClick={onHome}>
          ← Panou admin
        </button>
      )}
      <ol className={styles.steps}>
        {STAGES.map((st, i) => (
          <li key={st.id}>
            {i > 0 && <span className={styles.sep} aria-hidden="true">›</span>}
            <button
              className={`${styles.stepBtn} ${st.id === current ? styles.stepActive : ""}`}
              onClick={() => st.id !== current && onGo(st.id)}
              aria-current={st.id === current ? "step" : undefined}
            >
              <span aria-hidden="true">{st.icon}</span> {st.label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
