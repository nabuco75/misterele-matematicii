import React, { useState, useEffect } from "react";
import { getDoc, collection, addDoc, getDocs, deleteDoc, updateDoc, doc, query, where } from "firebase/firestore";
import { db } from "./firebase";
import * as XLSX from "xlsx";
import NavBar from "./NavBar";
import styles from "./AdminDashboard.module.css";

function AdminDashboard() {
  const [showAddSchoolForm, setShowAddSchoolForm] = useState(false);
  const [schoolName, setSchoolName] = useState("");
  const [judet, setJudet] = useState("");
  const [localitate, setLocalitate] = useState("");
  const [schools, setSchools] = useState([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState(""); // Store selected school ID
  const [isEditing, setIsEditing] = useState(false); // Track edit mode
  const [statistics, setStatistics] = useState(null);
  const [showStatistics, setShowStatistics] = useState(false);

  const handleAddOrEditSchool = async (e) => {
    e.preventDefault();
    if (schoolName.trim() !== "" && judet.trim() !== "" && localitate.trim() !== "") {
      try {
        if (isEditing && selectedSchoolId) {
          // Update existing school
          await updateDoc(doc(db, "schools", selectedSchoolId), {
            name: schoolName,
            county: judet,
            locality: localitate,
          });
        } else {
          // Add new school
          await addDoc(collection(db, "schools"), {
            name: schoolName,
            county: judet,
            locality: localitate,
          });
        }

        // Reset form and state after operation
        setSchoolName("");
        setJudet("");
        setLocalitate("");
        setSelectedSchoolId("");
        setIsEditing(false);
        fetchSchools();
        setShowAddSchoolForm(false);
      } catch (err) {
        console.error("Eroare la adăugarea sau actualizarea școlii", err);
      }
    }
  };

  const handleDeleteSchool = async () => {
    if (selectedSchoolId) {
      try {
        const q = query(collection(db, "registration"), where("schoolId", "==", selectedSchoolId));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach(async (doc) => {
          await deleteDoc(doc.ref);
        });
        await deleteDoc(doc(db, "schools", selectedSchoolId));
        setSelectedSchoolId(""); // Reset selected school
        fetchSchools();
      } catch (err) {
        console.error("Eroare la ștergerea școlii și a elevilor:", err);
      }
    }
  };

  const handleEditSchool = () => {
    if (selectedSchoolId) {
      const selectedSchool = schools.find((school) => school.id === selectedSchoolId);
      if (selectedSchool) {
        setSchoolName(selectedSchool.name);
        setJudet(selectedSchool.county);
        setLocalitate(selectedSchool.locality);
        setIsEditing(true);
        setShowAddSchoolForm(true); // Show the form for editing
      }
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

  const exportToExcel = async () => {
    try {
      const registrationsSnapshot = await getDocs(collection(db, "registration"));
      if (registrationsSnapshot.empty) {
        console.error("Nu există date de înscriere.");
        return;
      }

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

      let rowNumber = 1;
      for (const registrationDoc of registrationsSnapshot.docs) {
        const registrationData = registrationDoc.data();
        const schoolDoc = await getDoc(doc(db, "schools", registrationData.schoolId));
        const schoolName = schoolDoc.exists() ? schoolDoc.data().name : "";

        registrationData.students?.forEach((student) => {
          rows.push({
            nrCrt: rowNumber++,
            elev: student.nume || "",
            clasa: registrationData.class || "",
            scoala: schoolName,
            profesorIndrumator: registrationData.profesorIndrumatorEmail || "",
            telefon: student.telefon || registrationData.telefon || "",
          });
        });
      }

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Elevi Înscriși");
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

        {showAddSchoolForm && (
          <form className={styles.formContainer} onSubmit={handleAddOrEditSchool}>
            <input type="text" placeholder="Nume școală" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} className={styles.inputField} />
            <input type="text" placeholder="Județul școlii" value={judet} onChange={(e) => setJudet(e.target.value)} className={styles.inputField} />
            <input type="text" placeholder="Localitatea școlii" value={localitate} onChange={(e) => setLocalitate(e.target.value)} className={styles.inputField} />
            <div className={styles.formActions}>
              <button type="submit" className={styles.submitButton}>
                {isEditing ? "Salvează modificările" : "Adaugă"}
              </button>
              <button type="button" className={styles.cancelButton} onClick={() => setShowAddSchoolForm(false)}>
                Anulează
              </button>
            </div>
          </form>
        )}

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

        <h2 className={styles.schoolListTitle}>Lista școlilor:</h2>

        {/* Dropdown for selecting schools */}
        <div className={styles.dropdownContainer}>
          <select value={selectedSchoolId} onChange={(e) => setSelectedSchoolId(e.target.value)} className={styles.dropdown}>
            <option value="" disabled>
              Selectează o școală
            </option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name} - {school.county} - {school.locality}
              </option>
            ))}
          </select>

          {/* Buttons to delete or edit the selected school */}
          <button onClick={handleDeleteSchool} disabled={!selectedSchoolId} className={styles.deleteButton}>
            Șterge școala selectată
          </button>
          <button onClick={handleEditSchool} disabled={!selectedSchoolId} className={styles.editButton}>
            Editează școala selectată
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
