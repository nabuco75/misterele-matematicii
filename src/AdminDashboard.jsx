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
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [statistics, setStatistics] = useState(null);
  const [showStatistics, setShowStatistics] = useState(false);
  const [bulkUploadStatus, setBulkUploadStatus] = useState(null);
  const [students, setStudents] = useState([]);
  const [showStudentEditor, setShowStudentEditor] = useState(false);

  useEffect(() => {
    fetchSchools();
  }, []);

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

  const handleAddOrEditSchool = async (e) => {
    e.preventDefault();
    if (schoolName && judet && localitate) {
      try {
        if (isEditing && selectedSchoolId) {
          await updateDoc(doc(db, "schools", selectedSchoolId), {
            name: schoolName,
            county: judet,
            locality: localitate,
          });
        } else {
          await addDoc(collection(db, "schools"), {
            name: schoolName,
            county: judet,
            locality: localitate,
          });
        }
        resetSchoolForm();
        fetchSchools();
      } catch (err) {
        console.error("Eroare la adăugarea sau actualizarea școlii", err);
      }
    }
  };

  const resetSchoolForm = () => {
    setSchoolName("");
    setJudet("");
    setLocalitate("");
    setSelectedSchoolId("");
    setIsEditing(false);
    setShowAddSchoolForm(false);
  };

  const handleDeleteSchool = async () => {
    if (selectedSchoolId) {
      try {
        const q = query(collection(db, "registration"), where("schoolId", "==", selectedSchoolId));
        const querySnapshot = await getDocs(q);
        for (const doc of querySnapshot.docs) {
          await deleteDoc(doc.ref);
        }
        await deleteDoc(doc(db, "schools", selectedSchoolId));
        setSelectedSchoolId("");
        fetchSchools();
      } catch (err) {
        console.error("Eroare la ștergerea școlii și a elevilor:", err);
      }
    }
  };

  const handleEditSchool = () => {
    const selectedSchool = schools.find((school) => school.id === selectedSchoolId);
    if (selectedSchool) {
      setSchoolName(selectedSchool.name);
      setJudet(selectedSchool.county);
      setLocalitate(selectedSchool.locality);
      setIsEditing(true);
      setShowAddSchoolForm(true);
    }
  };

  const handleSaveEdit = async () => {
    if (selectedSchoolId && schoolName) {
      try {
        await updateDoc(doc(db, "schools", selectedSchoolId), { name: schoolName });
        resetSchoolForm();
        fetchSchools();
      } catch (err) {
        console.error("Eroare la salvarea modificării", err);
      }
    }
  };

  const handleCancelEdit = () => {
    resetSchoolForm();
  };

  const handleEditStudents = async () => {
    if (!selectedSchoolId) return;

    try {
      const q = query(collection(db, "registration"), where("schoolId", "==", selectedSchoolId));
      const querySnapshot = await getDocs(q);
      const studentList = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (Array.isArray(data.students)) {
          data.students.forEach((student, index) => {
            if (typeof student === "string") {
              studentList.push({
                id: `${doc.id}-${index}`,
                nume: student,
              });
            } else if (typeof student === "object") {
              studentList.push({
                id: `${doc.id}-${index}`,
                nume: student.nume || "",
              });
            }
          });
        }
      });

      setStudents(studentList);
      setShowStudentEditor(true);
    } catch (err) {
      console.error("Eroare la aducerea elevilor:", err);
    }
  };

  const handleDeleteStudent = (studentId) => {
    setStudents((prev) => prev.filter((student) => student.id !== studentId));
  };

  const toggleStatistics = () => {
    if (!showStatistics) fetchStatistics();
    setShowStatistics(!showStatistics);
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

  const exportToExcel = async () => {
    try {
      const registrationsSnapshot = await getDocs(collection(db, "registration"));
      const rows = [{ nrCrt: "Nr. crt", elev: "Elev", clasa: "Clasa", scoala: "Scoala", profesorIndrumator: "Profesor Îndrumător", telefon: "Telefon" }];
      let rowNumber = 1;
      for (const doc of registrationsSnapshot.docs) {
        const data = doc.data();
        const schoolDoc = await getDoc(doc(db, "schools", data.schoolId));
        const schoolName = schoolDoc.exists() ? schoolDoc.data().name : "";
        data.students.forEach((student) => {
          rows.push({
            nrCrt: rowNumber++,
            elev: student.nume || "",
            clasa: data.class || "",
            scoala: schoolName,
            profesorIndrumator: data.profesorIndrumatorEmail || "",
            telefon: student.telefon || data.telefon || "",
          });
        });
      }
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Elevi Înscriși");
      XLSX.writeFile(workbook, "elevi_inscrisi.xlsx");
    } catch (err) {
      console.error("Eroare la exportul în Excel:", err);
    }
  };

  const handleBulkUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        await Promise.all(
          rows.map((row) => {
            if (row.Nume && row.Județ && row.Localitate) {
              return addDoc(collection(db, "schools"), { name: row.Nume, county: row.Județ, locality: row.Localitate });
            }
          })
        );
        setBulkUploadStatus("Școlile au fost încărcate cu succes!");
        fetchSchools();
      } catch (err) {
        setBulkUploadStatus("Eroare la încărcarea bulk a școlilor.");
        console.error(err);
      }
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
          <button onClick={exportToExcel} className={styles.exportButton}>
            Descarcă elevii înscriși
          </button>
          <input type="file" accept=".xlsx, .xls" onChange={handleBulkUpload} className={styles.fileInput} />
          <button onClick={() => document.querySelector(`.${styles.fileInput}`).click()} className={styles.bulkUploadButton}>
            Încarcă școli din Excel
          </button>
          {bulkUploadStatus && <p className={styles.successMessage}>{bulkUploadStatus}</p>}
        </div>

        {showAddSchoolForm && (
          <form onSubmit={handleAddOrEditSchool} className={styles.formContainer}>
            <input type="text" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="Nume școală" className={styles.inputField} />
            <input type="text" value={judet} onChange={(e) => setJudet(e.target.value)} placeholder="Județul școlii" className={styles.inputField} />
            <input type="text" value={localitate} onChange={(e) => setLocalitate(e.target.value)} placeholder="Localitatea școlii" className={styles.inputField} />
            <div className={styles.formActions}>
              {isEditing ? (
                <>
                  <button type="button" onClick={handleSaveEdit} className={styles.submitButton}>
                    Salvează
                  </button>
                  <button type="button" onClick={handleCancelEdit} className={styles.cancelButton}>
                    Anulează
                  </button>
                </>
              ) : (
                <button type="submit" className={styles.submitButton}>
                  Adaugă
                </button>
              )}
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
          <div className={styles.buttonGroup}>
            <button onClick={handleDeleteSchool} disabled={!selectedSchoolId} className={styles.deleteButton}>
              Șterge școala selectată
            </button>
            <button onClick={handleEditSchool} disabled={!selectedSchoolId} className={styles.editButton}>
              Editează școala selectată
            </button>
            <button onClick={handleEditStudents} disabled={!selectedSchoolId} className={styles.editButton}>
              Editare Elevi
            </button>
          </div>
        </div>

        {showStudentEditor && (
          <div className={styles.studentList}>
            <h2>Elevi înscriși:</h2>
            {students.length > 0 ? (
              students.map((student) => (
                <div key={student.id} className={styles.studentItem}>
                  <input
                    type="text"
                    value={student.nume || ""}
                    onChange={(e) => {
                      const updatedStudents = students.map((s) => (s.id === student.id ? { ...s, nume: e.target.value } : s));
                      setStudents(updatedStudents);
                    }}
                    className={styles.inputField}
                  />
                  <button onClick={() => handleDeleteStudent(student.id)} className={styles.deleteButton}>
                    Șterge
                  </button>
                </div>
              ))
            ) : (
              <p className={styles.noStudentsMessage}>Nu există elevi înscriși.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
