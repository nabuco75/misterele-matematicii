import React, { useState, useEffect } from "react";
import SchoolSelection from "./SchoolSelection";
import ClassForm from "./ClassForm";
import styles from "./Landing.module.css";
import { useAppStatus } from "./hooks/useAppStatus";

function Landing() {
  const [selectedSchool, setSelectedSchool] = useState("");
  const [showClassForm, setShowClassForm] = useState(false);

  // Hook pentru status (citește din Firebase)
  const { isActive, message, loading } = useAppStatus();

  // Resetări la montare
  useEffect(() => {
    setSelectedSchool("");
    setShowClassForm(false);
  }, []);

  const handleInscrieClick = () => {
    setShowClassForm(true);
  };

  // ========== LOADING STATE ==========
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Se încarcă...</p>
      </div>
    );
  }

  // ========== PAGINA PRINCIPALĂ ==========
  return (
    <div className={styles.landingContainer}>
      {/* Titlu principal */}
      <h1 className={styles.welcomeMessage}>
        Bine ați venit la concursul Misterele Matematicii!
      </h1>

      <p className={styles.instructions}>
        Alegeți județul, localitatea și școala pentru a înscrie elevii.
      </p>

      {/* ========== CARD ÎNCHIDERE (când isActive = false) ========== */}
      {!isActive && (
        <>
          <div className={styles.infoCard}>
            <div className={styles.lockIcon}>🔒</div>
            {message}
            <p className={styles.contactInfo}>
              Pentru întrebări, contactați{" "}
              <a href="mailto:contact@scoala5vaslui.ro">contact@scoala5vaslui.ro</a>
            </p>
          </div>

          {/* ✨ BUTON ELEGANT DE TESTARE - doar pe localhost */}
          {(window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1') && (
            <button 
              onClick={() => window.location.search = '?force=true'}
              className={styles.devModeButton}
              title="Activează modul de testare pentru dezvoltatori"
            >
              <span className={styles.devIcon}>🧪</span>
              <span className={styles.devText}>Mod Testare</span>
            </button>
          )}
        </>
      )}

      {/* Mesaj completare date lipsă */}
      <p className={styles.missingMessage}>
        Dacă județul, localitatea sau școala dvs. nu apare în listă, vă rugăm să
        trimiteți aceste date la adresa{" "}
        <strong>contact@scoala5vaslui.ro</strong> pentru a fi adăugate în baza de
        date.
      </p>

      {/* ========== FORMULAR ACTIV (când isActive = true) ========== */}
      {isActive && (
        <>
          <SchoolSelection
            setSelectedSchool={(schoolId) => {
              setSelectedSchool(schoolId);
            }}
          />

          {selectedSchool && !showClassForm && (
            <button className={styles.inscrieButton} onClick={handleInscrieClick}>
              Înscrie elevi
            </button>
          )}

          {/* ClassForm cu modal de autentificare integrat */}
          {showClassForm && (
            <div style={{ paddingTop: "100px" }}>
              <ClassForm selectedSchool={selectedSchool} schoolId={selectedSchool} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Landing;