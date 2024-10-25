import React, { useState, useEffect } from "react";
import { getDoc } from "firebase/firestore";

import { collection, addDoc, getDocs, deleteDoc, doc, query, where } from "firebase/firestore";
import { db } from "./firebase";
import * as XLSX from "xlsx"; // Pentru exportul în Excel
import NavBar from "./NavBar";
import styles from "./AdminDashboard.module.css";

function AdminDashboard() {
  const [showAddSchoolForm, setShowAddSchoolForm] = useState(false);
  const [schoolName, setSchoolName] = useState("");
  const [judet, setJudet] = useState("");
  const [localitate, setLocalitate] = useState("");
  const [schools, setSchools] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [showStatistics, setShowStatistics] = useState(false);

  const handleAddSchool = async (e) => {
    e.preventDefault();
    if (schoolName.trim() !== "" && judet.trim() !== "" && localitate.trim() !== "") {
      try {
        await addDoc(collection(db, "schools"), {
          name: schoolName,
          county: judet,
          locality: localitate,
        });
        setSchoolName("");
        setJudet("");
        setLocalitate("");
        fetchSchools();
        setShowAddSchoolForm(false);
      } catch (err) {
        console.error("Eroare la adăugarea școlii", err);
      }
    }
  };

  const handleDeleteSchool = async (schoolId) => {
    try {
      const q = query(collection(db, "registration"), where("schoolId", "==", schoolId));
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach(async (doc) => {
        await deleteDoc(doc.ref);
      });
      await deleteDoc(doc(db, "schools", schoolId));
      fetchSchools();
    } catch (err) {
      console.error("Eroare la ștergerea școlii și a elevilor:", err);
    }
  };

  const fetchSchools = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "schools"));
      const schoolList = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setSchools(schoolList);
    } catch (err) {
      console.error("Eroare la aducerea listei de școli", err);
    }
  };

  const fetchStatistics = async () => {
    try {
      const registrationSnapshot = await getDocs(collection(db, "registration"));
      const classCounts = {
        "a IV-a": 0,
        "a V-a": 0,
        "a VI-a": 0,
        "a VII-a": 0,
      };
      const schoolSet = new Set();

      registrationSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        schoolSet.add(data.schoolId);
        if (classCounts[data.class] !== undefined) {
          classCounts[data.class] += data.students.length;
        }
      });

      setStatistics({
        totalSchools: schoolSet.size,
        ...classCounts,
        totalStudents: Object.values(classCounts).reduce((acc, count) => acc + count, 0),
      });
    } catch (err) {
      console.error("Eroare la obținerea statisticilor", err);
    }
  };

  useEffect(() => {
    fetchSchools();
  }, []);

  const toggleStatistics = () => {
    if (!showStatistics) {
      fetchStatistics();
    }
    setShowStatistics(!showStatistics);
  };

  // Funcție pentru a exporta datele în Excel

  // Funcție pentru a exporta datele în Excel
  const exportToExcel = async () => {
    try {
      // Obținem datele din colecția 'registration'
      const registrationsSnapshot = await getDocs(collection(db, "registration"));

      if (registrationsSnapshot.empty) {
        console.error("Nu există date de înscriere.");
        return;
      }

      // Capul de tabel este adăugat la început, o singură dată
      const rows = [
        {
          nrCrt: "Nr. crt",
          elev: "Elev",
          clasa: "Clasa",
          scoala: "Scoala",
          profesorIndrumator: "Profesor Îndrumător",
          telefon: "Telefon",
        },
      ];

      let rowNumber = 1; // Începem de la numărul 1 pentru rânduri

      // Parcurgem toate înregistrările din 'registration'
      for (const registrationDoc of registrationsSnapshot.docs) {
        const registrationData = registrationDoc.data();
        const schoolId = registrationData.schoolId;
        const className = registrationData.class || "";
        const professorIndrumator = registrationData.profesorIndrumatorEmail || "";
        const telefonElev = registrationData.telefon || ""; // Extragem telefonul direct din registrationData

        console.log("Procesăm înscrierea:", registrationData);

        // Obținem numele școlii
        const schoolDoc = await getDoc(doc(db, "schools", schoolId));
        const schoolName = schoolDoc.exists() ? schoolDoc.data().name : "";

        console.log("Școala:", schoolName);

        if (registrationData.students && registrationData.students.length > 0) {
          registrationData.students.forEach((student) => {
            console.log("Elevul procesat:", student);
            console.log("Telefon elev:", telefonElev); // Folosim telefonul extras din registrationData

            // Adăugăm rânduri pentru fiecare elev
            rows.push({
              nrCrt: rowNumber,
              elev: student.nume || "", // Numele elevului
              clasa: className,
              scoala: schoolName, // Numele școlii
              profesorIndrumator: professorIndrumator, // Profesor îndrumător
              telefon: student.telefon || telefonElev, // Telefonul elevului sau al profesorului
            });
            rowNumber++;
          });
        } else {
          // Dacă nu există elevi în această înscriere, adăugăm un rând gol
          console.log("Nu există elevi pentru această înscriere.");
          rows.push({
            nrCrt: rowNumber,
            elev: "", // Gol pentru elev
            clasa: className,
            scoala: schoolName, // Numele școlii
            profesorIndrumator: professorIndrumator, // Profesor îndrumător
            telefon: telefonElev, // Gol pentru telefon
          });
          rowNumber++;
        }
      }

      console.log("Datele finale pentru export:", rows);

      // Generăm fișierul Excel
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Elevi Înscriși");

      // Salvăm fișierul Excel
      XLSX.writeFile(workbook, "elevi_inscrisi.xlsx");
    } catch (error) {
      console.error("Eroare la exportul în Excel:", error);
    }
  };

  return (
    <div>
      <NavBar />
      <div className={styles.container}>
        <h1 className={styles.title}>Bine ai venit în panoul de administrare!</h1>

        {/* Butoane pentru adăugare și statistici */}
        <div className={styles.buttonContainer}>
          <button onClick={() => setShowAddSchoolForm(!showAddSchoolForm)} className={styles.addButton}>
            {showAddSchoolForm ? "Ascunde formularul" : "Adaugă o școală"}
          </button>
          <button onClick={toggleStatistics} className={styles.statsButton}>
            {showStatistics ? "Ascunde situație înscrieri" : "Situație înscrieri"}
          </button>
          <button className={styles.exportButton} onClick={exportToExcel}>
            Descarcă elevii înscriși
          </button>
        </div>

        {/* Afișarea formularului */}
        {showAddSchoolForm && (
          <form className={styles.formContainer} onSubmit={handleAddSchool}>
            <input type="text" placeholder="Nume școală" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} className={styles.inputField} />
            <input type="text" placeholder="Județul școlii" value={judet} onChange={(e) => setJudet(e.target.value)} className={styles.inputField} />
            <input type="text" placeholder="Localitatea școlii" value={localitate} onChange={(e) => setLocalitate(e.target.value)} className={styles.inputField} />

            {/* Butoane Adaugă și Anulează */}
            <div className={styles.formActions}>
              <button type="submit" className={styles.submitButton}>
                Adaugă
              </button>
              <button type="button" className={styles.cancelButton} onClick={() => setShowAddSchoolForm(false)}>
                Anulează
              </button>
            </div>
          </form>
        )}

        {/* Afișarea statisticilor */}
        {showStatistics && statistics && (
          <div className={styles.statistics}>
            <h2>Statistici înscrieri</h2>
            <p>Număr total școli înscrise: {statistics.totalSchools}</p>
            <p>Număr elevi clasa a IV-a: {statistics["a IV-a"]}</p>
            <p>Număr elevi clasa a V-a: {statistics["a V-a"]}</p>
            <p>Număr elevi clasa a VI-a: {statistics["a VI-a"]}</p>
            <p>Număr elevi clasa a VII-a: {statistics["a VII-a"]}</p>
            <p>Total elevi înscriși: {statistics.totalStudents}</p>
          </div>
        )}

        {/* Afișarea listei școlilor */}
        <h2 className={styles.schoolListTitle}>Lista școlilor:</h2>
        <ul className={styles.schoolList}>
          {schools.map((school) => (
            <li key={school.id}>
              {school.name} - {school.county} - {school.locality}
              <button className={styles.deleteButton} onClick={() => handleDeleteSchool(school.id)}>
                Șterge
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default AdminDashboard;
