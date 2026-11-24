import React, { useState, useEffect } from "react";
import SchoolSelection from "./SchoolSelection";
import ClassForm from "./ClassForm";
import AuroraStage from "./Aurora";
import Icon from "./icons.jsx";
import styles from "./Landing.module.css";
import { useAppStatus } from "./hooks/useAppStatus";

const CONTACT = "contact@scoala5vaslui.ro";

function Landing() {
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [showClassForm, setShowClassForm] = useState(false);
  // codul de acces a fost acceptat (doar pentru indicatorul de pași)
  const [authed, setAuthed] = useState(false);

  // Hook pentru status (citește din Firebase)
  const { isActive, message, loading } = useAppStatus();

  // Resetări la montare
  useEffect(() => {
    setSelectedSchool(null);
    setShowClassForm(false);
  }, []);

  const handleInscrieClick = () => {
    setShowClassForm(true);
  };

  const isLocalhost =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

  // pasul curent: 1 școala, 2 codul de acces, 3 elevii
  const step = !showClassForm || !selectedSchool ? 1 : authed ? 3 : 2;
  const STEPS = [
    { n: 1, label: "Alegeți școala", icon: "school" },
    { n: 2, label: "Codul de acces", icon: "lock" },
    { n: 3, label: "Elevii și profesorul", icon: "users" },
  ];

  // ========== LOADING STATE ==========
  if (loading) {
    return (
      <AuroraStage>
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>Se încarcă...</p>
        </div>
      </AuroraStage>
    );
  }

  // ========== PAGINA PRINCIPALĂ ==========
  return (
    <AuroraStage>
      <main className={styles.page}>
        {/* antet */}
        <header className={styles.hero}>
          <p className={styles.eyebrow}>
            <span className={`${styles.statusDot} ${isActive ? styles.statusOpen : styles.statusClosed}`} />
            {isActive ? "Înscrierile sunt deschise" : "Înscrierile sunt închise"}
          </p>
          <h1 className={styles.title}>
            Misterele <span className={styles.titleAccent}>Matematicii</span>
          </h1>
          <p className={styles.lead}>
            Concurs de matematică organizat de Școala Gimnazială „Ștefan cel Mare” Vaslui. Profesorii
            îndrumători înscriu aici elevii claselor a IV-a – a VII-a.
          </p>
        </header>

        {/* ========== ÎNSCRIERI ÎNCHISE ========== */}
        {!isActive && (
          <section className={styles.closedCard}>
            <div className={styles.closedIcon}>
              <Icon name="lock" size={34} strokeWidth={1.6} />
            </div>
            <h2 className={styles.closedTitle}>Înscrierile nu sunt deschise acum</h2>
            {message && <p className={styles.closedText}>{message}</p>}
            <a className={styles.mailButton} href={`mailto:${CONTACT}`}>
              <Icon name="arrow" size={18} />
              Scrieți-ne la {CONTACT}
            </a>

            {/* ✨ BUTON DE TESTARE - doar pe localhost */}
            {isLocalhost && (
              <button
                onClick={() => (window.location.search = "?force=true")}
                className={styles.devModeButton}
                title="Activează modul de testare pentru dezvoltatori"
              >
                <span className={styles.devIcon}>🧪</span>
                <span className={styles.devText}>Mod Testare</span>
              </button>
            )}
          </section>
        )}

        {/* ========== FORMULAR ACTIV ========== */}
        {/* dacă înscrierile se închid în timp ce profesorul completează, formularul rămâne
            (serverul refuză trimiterea cu mesaj clar), ca să nu piardă ce a scris */}
        {(isActive || showClassForm) && (
          <>
            {/* pașii */}
            <ol className={styles.steps} aria-label="Pașii înscrierii">
              {STEPS.map((s) => (
                <li
                  key={s.n}
                  className={`${styles.step} ${s.n < step ? styles.stepDone : ""} ${s.n === step ? styles.stepActive : ""}`}
                  aria-current={s.n === step ? "step" : undefined}
                >
                  <span className={styles.stepDot}>
                    {s.n < step ? <Icon name="check" size={20} strokeWidth={2} /> : <Icon name={s.icon} size={20} />}
                  </span>
                  <span className={styles.stepText}>
                    <span className={styles.stepNum}>Pasul {s.n}</span>
                    <span className={styles.stepLabel}>{s.label}</span>
                  </span>
                </li>
              ))}
            </ol>

            <section className={styles.schoolCard}>
              <SchoolSelection
                setSelectedSchool={(school) => {
                  setSelectedSchool(school);
                  // fără școală aleasă, formularul se închide
                  if (!school) {
                    setShowClassForm(false);
                    setAuthed(false);
                  }
                }}
              />

              {selectedSchool && !showClassForm && (
                <button className={styles.inscrieButton} onClick={handleInscrieClick}>
                  Înscrie elevi
                  <Icon name="arrow" size={20} />
                </button>
              )}
            </section>

            {/* ClassForm cu modal de autentificare integrat */}
            {showClassForm && selectedSchool && (
              <div className={styles.formWrap}>
                <ClassForm
                  selectedSchool={selectedSchool}
                  onAuthenticated={() => setAuthed(true)}
                  onCancel={() => setShowClassForm(false)}
                />
              </div>
            )}
          </>
        )}

        {/* școala lipsește din listă */}
        <aside className={styles.missing}>
          <Icon name="search" size={20} className={styles.missingIcon} />
          <p>
            Județul, localitatea sau școala dvs. nu apare în listă? Trimiteți datele la{" "}
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a> și le adăugăm în baza de date.
          </p>
        </aside>
      </main>
    </AuroraStage>
  );
}

export default Landing;
