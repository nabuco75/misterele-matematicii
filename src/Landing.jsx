import React, { useState } from "react";
import SchoolSelection from "./SchoolSelection";
import ClassButtons from "./ClassButtons";
import ClassForm from "./ClassForm";
import NavBar from "./NavBar";
import styles from "./Landing.module.css";

function Landing() {
  const [selectedSchool, setSelectedSchool] = useState("");
  const [selectedClass, setSelectedClass] = useState("");

  return (
    <div>
      <NavBar /> {/* Navbar-ul va fi vizibil în partea de sus */}
      <div className={styles.landingContainer}>
        <h1 className={styles.welcomeMessage}>Bine ați venit la concursul Misterele Matematicii!</h1>
        <p className={styles.instructions}>Alegeți județul, școala și clasa pentru a înscrie elevii.</p>
        <SchoolSelection selectedSchool={selectedSchool} setSelectedSchool={setSelectedSchool} />
        {selectedSchool && <ClassButtons setSelectedClass={setSelectedClass} />}
        {selectedClass && <ClassForm selectedClass={selectedClass} selectedSchool={selectedSchool} />}
      </div>
    </div>
  );
}

export default Landing;
