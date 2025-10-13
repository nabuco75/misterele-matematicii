import React, { useState, useEffect, useRef } from "react";
import {
  getDoc,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  query,
  where,
  runTransaction, // ✅ pentru salvare atomică
} from "firebase/firestore";
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

  // --- NOU: UI pt. "Școli înscrise" ---
  const [showRegisteredSchools, setShowRegisteredSchools] = useState(false);
  const [registeredSchools, setRegisteredSchools] = useState([]);
  const [loadingRegs, setLoadingRegs] = useState(false);

  // --- NOU: autosave elevi ---
  const [saveStatus, setSaveStatus] = useState({}); // { [studentId]: 'idle'|'saving'|'saved'|'error' }
  const saveTimersRef = useRef({}); // { [studentId]: timeoutId }

  useEffect(() => {
    fetchSchools();
  }, []);

  const fetchSchools = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "schools"));
      const schoolList = querySnapshot.docs.map((s) => ({
        id: s.id,
        ...s.data(),
      }));

      // ✅ sortare: județ → localitate → nume (cu diacritice)
      schoolList.sort(
        (a, b) =>
          (a.county || "").localeCompare(b.county || "", "ro", { sensitivity: "base" }) ||
          (a.locality || "").localeCompare(b.locality || "", "ro", { sensitivity: "base" }) ||
          (a.name || "").localeCompare(b.name || "", "ro", { sensitivity: "base" })
      );

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
    if (!selectedSchoolId) return;
    try {
      const qReg = query(collection(db, "registration"), where("schoolId", "==", selectedSchoolId));
      const qSnap = await getDocs(qReg);
      for (const regDoc of qSnap.docs) {
        await deleteDoc(regDoc.ref);
      }
      await deleteDoc(doc(db, "schools", selectedSchoolId));
      setSelectedSchoolId("");
      fetchSchools();
    } catch (err) {
      console.error("Eroare la ștergerea școlii și a elevilor:", err);
    }
  };

  const handleEditSchool = () => {
    const selectedSchool = schools.find((s) => s.id === selectedSchoolId);
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

      querySnapshot.forEach((reg) => {
        const data = reg.data();
        if (Array.isArray(data.students)) {
          data.students.forEach((student, index) => {
            const nume = typeof student === "string" ? student : student?.nume || "";
            studentList.push({
              id: `${reg.id}-${index}`,
              nume,
            });
          });
        }
      });

      setStudents(studentList);
      setShowStudentEditor(true);
    } catch (err) {
      console.error("Eroare la aducerea elevilor:", err);
    }
  };

  const handleDeleteStudent = async (studentId) => {
    const [registrationId, idxStr] = studentId.split("-");
    const idx = parseInt(idxStr, 10);

    try {
      const regRef = doc(db, "registration", registrationId);
      const snap = await getDoc(regRef);
      if (!snap.exists()) return;

      const data = snap.data();
      const current = Array.isArray(data.students) ? data.students : [];
      const updated = current.filter((_, i) => i !== idx);

      if (updated.length === 0) {
        await deleteDoc(regRef);
      } else {
        await updateDoc(regRef, { students: updated });
      }

      setStudents((prev) => prev.filter((s) => s.id !== studentId));
    } catch (e) {
      console.error("Eroare la ștergerea elevului:", e);
    }
  };

  const toggleStatistics = () => {
    if (!showStatistics) fetchStatistics();
    setShowStatistics((v) => !v);
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

      registrationSnapshot.docs.forEach((r) => {
        const data = r.data();
        schoolSet.add(data.schoolId);
        if (classCounts[data.class] !== undefined) {
          classCounts[data.class] += (data.students || []).length;
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

  // ===== NOU: lista școlilor cu elevi înscriși (fără download) =====
  const fetchRegisteredSchools = async () => {
    try {
      setLoadingRegs(true);

      const schoolsSnap = await getDocs(collection(db, "schools"));
      const schoolMap = {};
      schoolsSnap.forEach((s) => {
        const d = s.data();
        schoolMap[s.id] = {
          id: s.id,
          name: d.name || "",
          county: d.county || "",
          locality: d.locality || "",
          count: 0,
        };
      });

      const regsSnap = await getDocs(collection(db, "registration"));
      regsSnap.forEach((r) => {
        const d = r.data();
        const n = Array.isArray(d.students) ? d.students.length : 0;
        if (d.schoolId && schoolMap[d.schoolId]) {
          schoolMap[d.schoolId].count += n;
        }
      });

      const list = Object.values(schoolMap)
        .filter((s) => s.count > 0)
        .sort((a, b) => b.count - a.count);

      setRegisteredSchools(list);
    } catch (e) {
      console.error("Eroare la încărcarea școlilor înscrise:", e);
    } finally {
      setLoadingRegs(false);
    }
  };

  const exportToExcel = async () => {
    try {
      const regsSnap = await getDocs(collection(db, "registration"));
      const schoolsSnap = await getDocs(collection(db, "schools"));

      const schoolById = {};
      schoolsSnap.forEach((s) => {
        schoolById[s.id] = {
          name: s.data().name || "",
          county: s.data().county || "",
          locality: s.data().locality || "",
        };
      });

      const rows = [
        {
          nrCrt: "Nr. crt",
          elev: "Elev",
          clasa: "Clasa",
          scoala: "Școala",
          localitate: "Localitate",
          judet: "Județ",
          profesorIndrumator: "Profesor Îndrumător",
          telefon: "Telefon",
        },
      ];

      let rowNumber = 1;
      const countBySchool = new Map();

      for (const regDoc of regsSnap.docs) {
        const data = regDoc.data();
        const sc = schoolById[data.schoolId] || { name: "", county: "", locality: "" };
        const students = Array.isArray(data.students) ? data.students : [];

        countBySchool.set(data.schoolId, (countBySchool.get(data.schoolId) || 0) + students.length);

        for (const st of students) {
          const nume = typeof st === "string" ? st : st?.nume || "";
          const tel = typeof st === "object" ? st?.telefon || data.telefon || "" : data.telefon || "";
          rows.push({
            nrCrt: rowNumber++,
            elev: nume,
            clasa: data.class || "",
            scoala: sc.name,
            localitate: sc.locality,
            judet: sc.county,
            profesorIndrumator: data.profesorIndrumatorEmail || "",
            telefon: tel,
          });
        }
      }

      const fitColumns = (arr) =>
        Object.keys(arr[0] || {}).map((k) => ({
          wch: Math.max(k.length, ...arr.slice(1).map((r) => (r[k] ? String(r[k]).length : 0))) + 2,
        }));

      const wb = XLSX.utils.book_new();

      const ws1 = XLSX.utils.json_to_sheet(rows);
      ws1["!cols"] = fitColumns(rows);
      ws1["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(ws1["!ref"])) };
      ws1["!freeze"] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, ws1, "Elevi Înscriși");

      const summary = [["Școala", "Localitate", "Județ", "Nr. elevi"]];
      for (const [schoolId, cnt] of countBySchool.entries()) {
        const sc = schoolById[schoolId] || { name: "", county: "", locality: "" };
        summary.push([sc.name, sc.locality, sc.county, cnt]);
      }
      summary.splice(1, summary.length - 1, ...summary.slice(1).sort((a, b) => b[3] - a[3]));
      const ws2 = XLSX.utils.aoa_to_sheet(summary);
      ws2["!cols"] = fitColumns([{ a: "Școala", b: "Localitate", c: "Județ", d: "Nr. elevi" }, ...summary.slice(1).map((r) => ({ a: r[0], b: r[1], c: r[2], d: String(r[3]) }))]);
      ws2["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(ws2["!ref"])) };
      XLSX.utils.book_append_sheet(wb, ws2, "Școli – total");

      XLSX.writeFile(wb, "elevi_inscrisi.xlsx");
    } catch (err) {
      console.error("Eroare la exportul în Excel:", err);
    }
  };

  const handleBulkUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
      await Promise.all(
        rows.map((row) => {
          if (row.Nume && row.Județ && row.Localitate) {
            return addDoc(collection(db, "schools"), {
              name: row.Nume,
              county: row.Județ,
              locality: row.Localitate,
            });
          }
          return null;
        })
      );
      setBulkUploadStatus("Școlile au fost încărcate cu succes!");
      fetchSchools();
    } catch (err) {
      setBulkUploadStatus("Eroare la încărcarea bulk a școlilor.");
      console.error(err);
    }
  };

  // ============ AUTOSAVE cu debounce + tranzacție ============

  const doSaveStudentName = async (studentId, newName) => {
    const [registrationId, idxStr] = studentId.split("-");
    const idx = parseInt(idxStr, 10);
    const regRef = doc(db, "registration", registrationId);

    try {
      setSaveStatus((m) => ({ ...m, [studentId]: "saving" }));

      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(regRef);
        if (!snap.exists()) throw new Error("registration missing");

        const data = snap.data();
        const arr = Array.isArray(data.students) ? [...data.students] : [];

        if (Number.isNaN(idx) || idx < 0 || idx >= arr.length) {
          throw new Error("index out of range");
        }

        const prev = arr[idx];
        arr[idx] = typeof prev === "object" ? { ...prev, nume: newName } : newName;

        transaction.update(regRef, { students: arr });
      });

      setSaveStatus((m) => ({ ...m, [studentId]: "saved" }));
      setTimeout(() => {
        setSaveStatus((m) => (m[studentId] === "saved" ? { ...m, [studentId]: "idle" } : m));
      }, 1500);
    } catch (e) {
      console.error("Eroare la salvare:", e);
      setSaveStatus((m) => ({ ...m, [studentId]: "error" }));
    }
  };

  const scheduleAutosave = (studentId, newName) => {
    const prevT = saveTimersRef.current[studentId];
    if (prevT) clearTimeout(prevT);
    saveTimersRef.current[studentId] = setTimeout(() => {
      doSaveStudentName(studentId, newName);
    }, 700);
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

          {/* NOU: lista instant a școlilor înscrise */}
          <button
            onClick={async () => {
              await fetchRegisteredSchools();
              setShowRegisteredSchools((v) => !v);
            }}
            className={styles.statsButton}
          >
            {showRegisteredSchools ? "Ascunde școli înscrise" : "Școli înscrise"}
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

        {/* Statistici existente */}
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

        {/* NOU: panou simplu cu școlile înscrise */}
        {showRegisteredSchools && (
          <div
            style={{
              marginTop: 16,
              background: "white",
              borderRadius: 12,
              padding: 12,
              boxShadow: "0 6px 26px rgba(0,0,0,.08)",
            }}
          >
            <h2 style={{ margin: "6px 0 12px" }}>Școli cu elevi înscriși</h2>
            {loadingRegs ? (
              <p>Se încarcă...</p>
            ) : registeredSchools.length === 0 ? (
              <p>Deocamdată nu există înscrieri.</p>
            ) : (
              <table className={styles.schoolTable}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Școala</th>
                    <th>Localitate</th>
                    <th>Județ</th>
                    <th>Nr. elevi</th>
                  </tr>
                </thead>
                <tbody>
                  {registeredSchools.map((s, i) => (
                    <tr key={s.id}>
                      <td>{i + 1}</td>
                      <td>{s.name}</td>
                      <td>{s.locality}</td>
                      <td>{s.county}</td>
                      <td>{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                    {/* indicator status mic, elegant */}
                    <span
                      title={saveStatus[student.id] === "saving" ? "Se salvează…" : saveStatus[student.id] === "saved" ? "Salvat" : saveStatus[student.id] === "error" ? "Eroare la salvare" : "OK"}
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: saveStatus[student.id] === "saving" ? "#f39c12" : saveStatus[student.id] === "saved" ? "#2ecc71" : saveStatus[student.id] === "error" ? "#e74c3c" : "#bdc3c7",
                        boxShadow: "0 0 6px rgba(0,0,0,.2)",
                        flex: "0 0 auto",
                      }}
                    />
                    <input
                      type="text"
                      value={student.nume || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setStudents((prev) => prev.map((s) => (s.id === student.id ? { ...s, nume: v } : s)));
                        scheduleAutosave(student.id, v);
                      }}
                      className={styles.inputField}
                      style={{ flex: 1 }}
                    />
                  </div>
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
