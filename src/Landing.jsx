import React, { useState, useEffect } from "react";
import SchoolSelection from "./SchoolSelection";
import ClassForm from "./ClassForm";
import styles from "./Landing.module.css";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

function Landing() {
  const [selectedSchool, setSelectedSchool] = useState("");
  const [showClassForm, setShowClassForm] = useState(false);

  // GATE: control on/off din Firestore
  const [gate, setGate] = useState({ loading: true, isOpen: true, message: "" });

  // resetări la montare
  useEffect(() => {
    setSelectedSchool("");
    setShowClassForm(false);
  }, []);

  // subscribe la config/appStatus
  useEffect(() => {
    const ref = doc(db, "config", "appStatus");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setGate({ loading: false, isOpen: true, message: "" });
          return;
        }
        const data = snap.data() || {};
        const now = new Date();

        const toDate = (ts) => (ts && typeof ts.toDate === "function" ? ts.toDate() : undefined);

        const start = toDate(data.startAt) ?? new Date(0);
        const end = toDate(data.endAt) ?? new Date(8640000000000000);

       const isOpen = data.isActive === true && now >= start && now <= end;

        setGate({
          loading: false,
          isOpen,
          message: data.message || "Înscrierile sunt momentan închise. Vă rugăm reveniți ulterior.",
        });
      },
      (err) => {
        console.error("Eroare la citirea config/appStatus:", err);
        setGate({ loading: false, isOpen: true, message: "" });
      }
    );
    return () => unsub();
  }, []);

  const handleInscrieClick = () => {
    setShowClassForm(true);
  };

  return (
    <div className={styles.landingContainer}>
      <h1 className={styles.welcomeMessage}>Bine ați venit la concursul Misterele Matematicii!</h1>

      <p className={styles.instructions}>Alegeți județul, localitatea și școala pentru a înscrie elevii.</p>

      {/* Card status – apare când aplicația e închisă */}
      {!gate.loading && !gate.isOpen && <div className={styles.infoCard}>{gate.message}</div>}

      {/* Mesaj completare date lipsă */}
      <p className={styles.missingMessage}>
        Dacă județul, localitatea sau școala dvs. nu apare în listă, vă rugăm să trimiteți aceste date la adresa <strong>contact@scoala5vaslui.ro</strong> pentru a fi adăugate în baza de date.
      </p>

      {/* Selecție + formular - doar dacă e deschisă perioada */}
      {gate.isOpen && (
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

          {/* Wrapper cu paddingTop pentru a evita suprapunerea cu NavBar */}
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
