import React, { useState, useEffect } from "react";
import { collection, addDoc, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "./firebase";
import NavBar from "./NavBar"; // Import NavBar
import styles from "./AdminDashboard.module.css";

function AdminDashboard() {
  const [showAddSchoolForm, setShowAddSchoolForm] = useState(false);
  const [schoolName, setSchoolName] = useState("");
  const [judet, setJudet] = useState("");
  const [localitate, setLocalitate] = useState("");
  const [schools, setSchools] = useState([]);

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
      await deleteDoc(doc(db, "schools", schoolId));
      fetchSchools();
    } catch (err) {
      console.error("Eroare la ștergerea școlii", err);
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

  useEffect(() => {
    fetchSchools();
  }, []);

  return (
    <div>
      <NavBar /> {/* Adaugă NavBar aici */}
      <div className={styles.container}>
        <h1 className={styles.title}>Bine ai venit în panoul de administrare!</h1>
        <button onClick={() => setShowAddSchoolForm(!showAddSchoolForm)} className={styles.addButton}>
          {showAddSchoolForm ? "Ascunde formularul" : "Adaugă o școală"}
        </button>

        {showAddSchoolForm && (
          <form className={styles.formContainer} onSubmit={handleAddSchool}>
            <input type="text" placeholder="Nume școală" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} className={styles.inputField} />
            <input type="text" placeholder="Județul școlii" value={judet} onChange={(e) => setJudet(e.target.value)} className={styles.inputField} />
            <input type="text" placeholder="Localitatea școlii" value={localitate} onChange={(e) => setLocalitate(e.target.value)} className={styles.inputField} />
            <button type="submit" className={styles.submitButton}>
              Adaugă
            </button>
          </form>
        )}

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
