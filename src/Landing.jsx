import React, { useState, useEffect } from "react";
import SchoolSelection from "./SchoolSelection";
import ClassForm from "./ClassForm";
import NavBar from "./NavBar";
import styles from "./Landing.module.css";

function Landing() {
  const [selectedSchool, setSelectedSchool] = useState(""); // ID-ul școlii selectate
  const [showClassForm, setShowClassForm] = useState(false); // Controlează afișarea ClassForm

  // Resetează starea la montarea componentei (cand navighezi inapoi la landing)
  useEffect(() => {
    console.log("Componenta Landing a fost montată. Resetăm stările.");
    setSelectedSchool("");
    setShowClassForm(false); // Resetează la mesajul de bun venit
  }, []); // Declanșează o singură dată la montarea componentei

  const handleInscrieClick = () => {
    console.log("School ID înainte de a deschide formularul:", selectedSchool); // Verificăm dacă selectedSchool are ID-ul corect
    setShowClassForm(true);
  };

  return (
    <div>
      <NavBar /> {/* Navbar-ul va fi vizibil în partea de sus */}
      <div className={styles.landingContainer}>
        <h1 className={styles.welcomeMessage}>Bine ați venit la concursul Misterele Matematicii!</h1>
        <p className={styles.instructions}>Alegeți județul, localitatea și școala pentru a înscrie elevii.</p>

        {/* Selecția județului, localității și școlii */}
        <SchoolSelection
          setSelectedSchool={(schoolId) => {
            console.log("School ID selectat în SchoolSelection:", schoolId); // Verificăm ID-ul școlii selectate
            setSelectedSchool(schoolId);
          }}
        />

        {/* Afișează butonul "Înscrie elevi" doar dacă o școală este selectată */}
        {selectedSchool && !showClassForm && (
          <button className={styles.inscrieButton} onClick={handleInscrieClick}>
            Înscrie elevi
          </button>
        )}

        {/* Afișează formularul ClassForm doar după ce utilizatorul a apăsat pe "Înscrie elevi" */}
        {showClassForm && <ClassForm selectedSchool={selectedSchool} schoolId={selectedSchool} />}
      </div>
    </div>
  );
}

export default Landing;
