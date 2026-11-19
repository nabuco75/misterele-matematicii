// Partea de sus a panoului de admin: salut, numărătoare inversă până la concurs,
// „Urmează” (ce e de făcut acum), statistici și traseul etapelor concursului.
// Doar afișează: datele vin din useStageStatus (citire), nu se scrie nimic.
import { useEffect, useState } from "react";
import { STAGES } from "./StageNav.jsx";
import { loadHeader } from "./contestData";
import { CLASS_ORDER } from "./allocation";
import Icon from "./icons.jsx";
import styles from "./DashboardHero.module.css";

const STAGE_ICONS = { sali: "school", repartizare: "seat", coduri: "lock", tiparire: "printer", notare: "pen" };

const MONTHS = {
  ianuarie: 0, februarie: 1, martie: 2, aprilie: 3, mai: 4, iunie: 5,
  iulie: 6, august: 7, septembrie: 8, octombrie: 9, noiembrie: 10, decembrie: 11,
};

// „21 noiembrie 2026” → Date (sau null dacă nu se poate citi)
const parseRoDate = (text) => {
  const m = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (!m || MONTHS[m[2]] === undefined) return null;
  return new Date(Number(m[3]), MONTHS[m[2]], Number(m[1]));
};

const countdownText = (date) => {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date - today) / 86400000);
  if (days > 1) return { big: days, small: "zile până la concurs" };
  if (days === 1) return { big: "Mâine", small: "este concursul" };
  if (days === 0) return { big: "Astăzi", small: "este concursul" };
  return { big: "✓", small: "concursul a avut loc" };
};

const greeting = () => {
  const h = new Date().getHours();
  if (h < 11) return "Bună dimineața";
  if (h < 18) return "Bună ziua";
  return "Bună seara";
};

// cifră care „numără” până la valoare (fără animație dacă utilizatorul a cerut mișcare redusă)
function CountUp({ value }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !value) {
      setShown(value);
      return;
    }
    let raf;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, Math.max(0, (t - start) / 900));
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown}</>;
}

// ce e de făcut acum: prima etapă care are ceva de făcut
const nextAction = (status) => {
  if (!status) return null;
  const st = STAGES.find((s) => status[s.id]?.alert);
  if (st) return { stage: st, title: status[st.id].text, kicker: `Urmează · ${st.label}` };
  const n = status.notare;
  if (n && n.state !== "done" && n.done > 0) {
    return { stage: STAGES.find((s) => s.id === "notare"), title: n.text, kicker: "Urmează · Notare" };
  }
  return { stage: STAGES.find((s) => s.id === "notare"), title: "Totul e pregătit pentru concurs", kicker: "Gata", calm: true };
};

export default function DashboardHero({ status, error, onGo }) {
  const [header] = useState(loadHeader);
  const contestDate = parseRoDate(header.date);
  const cd = countdownText(contestDate);
  const action = nextAction(status);
  const meta = status?.meta;
  const maxClass = meta ? Math.max(1, ...CLASS_ORDER.map((c) => meta.perClass[c] || 0)) : 1;

  // traseul: cât e „aprins” (până la ultima etapă terminată, din șir)
  let lit = 0;
  if (status) {
    for (const s of STAGES) {
      if (status[s.id]?.state === "done") lit++;
      else break;
    }
  }
  const progress = STAGES.length > 1 ? Math.min(1, lit / (STAGES.length - 1)) : 0;

  return (
    <section className={styles.hero}>
      {/* salut + numărătoare inversă */}
      <header className={styles.top}>
        <div>
          <p className={styles.eyebrow}>Panou de administrare</p>
          <h1 className={styles.hello}>
            {greeting()} <span className={styles.wave}>👋</span>
          </h1>
          <p className={styles.sub}>
            Misterele Matematicii · Ediția {header.edition}
            {header.date ? ` · ${header.date}` : ""}
          </p>
        </div>
        {cd && (
          <div className={styles.countdown} data-glow>
            <Icon name="calendar" size={20} className={styles.cdIcon} />
            <span className={styles.cdBig}>{cd.big}</span>
            <span className={styles.cdSmall}>{cd.small}</span>
          </div>
        )}
      </header>

      {/* urmează + statistici */}
      <div className={styles.bento}>
        <div className={`${styles.next} ${action?.calm ? styles.nextCalm : ""}`} data-glow>
          <div className={styles.nextGlow} aria-hidden="true" />
          {action ? (
            <>
              <p className={styles.kicker}>
                <span className={styles.pulse} aria-hidden="true" />
                {action.kicker}
              </p>
              <h2 className={styles.nextTitle}>{action.title}</h2>
              <button className={styles.nextBtn} onClick={() => onGo(action.stage.id)}>
                <Icon name={STAGE_ICONS[action.stage.id]} size={20} />
                Mergi la {action.stage.label}
                <Icon name="arrow" size={18} className={styles.nextArrow} />
              </button>
            </>
          ) : (
            <p className={styles.kicker}>{error ? "Starea etapelor nu a putut fi citită." : "Se pregătește situația…"}</p>
          )}
        </div>

        <div className={styles.stat} data-glow>
          <p className={styles.statLabel}>Elevi înscriși</p>
          <p className={styles.statBig}>{meta ? <CountUp value={meta.students} /> : "—"}</p>
          <p className={styles.statSub}>{meta ? `din ${meta.schools} școli` : " "}</p>
          <div className={styles.bars} aria-label="Elevi pe clase">
            {CLASS_ORDER.map((c) => {
              const n = meta?.perClass[c] || 0;
              return (
                <div key={c} className={styles.barCol} title={`Clasa ${c}: ${n} elevi`}>
                  <span className={styles.barVal}>{meta ? n : ""}</span>
                  <span className={styles.barTrack}>
                    <span className={styles.barFill} style={{ height: `${meta ? (n / maxClass) * 100 : 0}%` }} />
                  </span>
                  <span className={styles.barKey}>{c.replace(/^a /, "").replace(/-a$/, "")}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* traseul etapelor */}
      <nav className={styles.track} aria-label="Etapele concursului">
        <div className={styles.rail} aria-hidden="true">
          <span className={styles.railFill} style={{ width: `${progress * 100}%` }} />
        </div>
        <ol className={styles.nodes}>
          {STAGES.map((st, i) => {
            const s = status?.[st.id];
            const state = s ? (s.alert ? "alert" : s.state) : "loading";
            return (
              <li key={st.id} className={styles.nodeItem} style={{ "--i": i }}>
                <button className={`${styles.node} ${styles[`node_${state}`] || ""}`} onClick={() => onGo(st.id)} data-glow>
                  <span className={styles.dot}>
                    {state === "done" ? <Icon name="check" size={22} strokeWidth={2} /> : <Icon name={STAGE_ICONS[st.id]} size={22} />}
                  </span>
                  <span className={styles.nodeStep}>Etapa {i + 1}</span>
                  <span className={styles.nodeLabel}>{st.label}</span>
                  <span className={styles.nodeText}>{s ? s.text : "se încarcă…"}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </section>
  );
}
