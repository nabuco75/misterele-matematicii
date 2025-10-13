import React, { useState, useEffect } from "react";
import SchoolSelection from "./SchoolSelection";
import ClassForm from "./ClassForm";
import NavBar from "./NavBar";
import styles from "./Landing.module.css";

function Landing() {
  const [selectedSchool, setSelectedSchool] = useState(""); // ID-ul școlii selectate
  const [showClassForm, setShowClassForm] = useState(false); // Controlează afișarea ClassForm

  useEffect(() => {
    console.log("Componenta Landing a fost montată. Resetăm stările.");
    setSelectedSchool("");
    setShowClassForm(false);
  }, []);

  const handleInscrieClick = () => {
    console.log("School ID înainte de a deschide formularul:", selectedSchool);
    setShowClassForm(true);
  };

  return (
    <div>
      <NavBar />
      <div className={styles.landingContainer}>
        <h1 className={styles.welcomeMessage}>Bine ați venit la concursul Misterele Matematicii!</h1>
        <p className={styles.instructions}>Alegeți județul, localitatea și școala pentru a înscrie elevii.</p>

        <p className={styles.missingMessage}>
          Dacă județul, localitatea sau școala dvs. nu apare în listă, vă rugăm să trimiteți aceste date la adresa <strong>contact@scoala5vaslui.ro</strong> pentru a fi adăugate în baza de date.
        </p>

        <SchoolSelection
          setSelectedSchool={(schoolId) => {
            console.log("School ID selectat în SchoolSelection:", schoolId);
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
          <div style={{ paddingTop: "170px" }}>
            <ClassForm selectedSchool={selectedSchool} schoolId={selectedSchool} />
          </div>
        )}
      </div>
    </div>
  );
}

export default Landing;
