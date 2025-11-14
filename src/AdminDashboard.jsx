import React, { useEffect, useRef, useState } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, runTransaction } from "firebase/firestore";
import { db } from "./firebase";
import * as XLSX from "xlsx";
import ConfirmModal from "./ConfirmModal.jsx";
import styles from "./AdminDashboard.module.css";

function AdminDashboard() {
  // —— Școli / selecție / form școală
  const [schools, setSchools] = useState([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");

  const [showAddSchoolForm, setShowAddSchoolForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [schoolName, setSchoolName] = useState("");
  const [judet, setJudet] = useState("");
  const [localitate, setLocalitate] = useState("");

  // —— Mesaje de confirmare pentru operațiuni școală
  const [schoolOperationMessage, setSchoolOperationMessage] = useState(null);

  // —— Statistici / listă școli înscrise
  const [statistics, setStatistics] = useState(null);
  const [showStatistics, setShowStatistics] = useState(false);

  const [showRegisteredSchools, setShowRegisteredSchools] = useState(false);
  const [registeredSchools, setRegisteredSchools] = useState([]);
  const [loadingRegs, setLoadingRegs] = useState(false);

  // —— Bulk upload
  const [bulkUploadStatus, setBulkUploadStatus] = useState(null);

  // —— Editor elevi
  const [showStudentEditor, setShowStudentEditor] = useState(false);
  const [students, setStudents] = useState([]);
  const [saveStatus, setSaveStatus] = useState({});
  const saveTimersRef = useRef({});

  // —— Modal confirmare
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // ====== INIT ======
  useEffect(() => {
    fetchSchools();
    return () => {
      Object.values(saveTimersRef.current).forEach(clearTimeout);
      saveTimersRef.current = {};
    };
  }, []);

  // ====== FETCH ȘCOLI ======
  const fetchSchools = async () => {
    try {
      const snap = await getDocs(collection(db, "schools"));
      const list = snap.docs.map((s) => ({ id: s.id, ...s.data() }));

      list.sort(
        (a, b) =>
          (a.county || "").localeCompare(b.county || "", "ro", { sensitivity: "base" }) ||
          (a.locality || "").localeCompare(b.locality || "", "ro", { sensitivity: "base" }) ||
          (a.name || "").localeCompare(b.name || "", "ro", { sensitivity: "base" })
      );
      setSchools(list);
    } catch (err) {
      console.error("Eroare la aducerea listei de școli:", err);
    }
  };

  // ====== HELPER: Afișare mesaj succes ======
  const showSuccessMessage = (message) => {
    setSchoolOperationMessage(message);
    setTimeout(() => {
      setSchoolOperationMessage(null);
    }, 3000);
  };

  // ====== CRUD ȘCOALĂ ======
  const resetSchoolForm = () => {
    setSchoolName("");
    setJudet("");
    setLocalitate("");
    setSelectedSchoolId("");
    setIsEditing(false);
    setShowAddSchoolForm(false);
  };

  const handleAddOrEditSchool = async (e) => {
    e.preventDefault();
    if (!schoolName || !judet || !localitate) return;

    try {
      if (isEditing && selectedSchoolId) {
        await updateDoc(doc(db, "schools", selectedSchoolId), {
          name: schoolName,
          county: judet,
          locality: localitate,
        });
        showSuccessMessage("Școala a fost actualizată cu succes!");
      } else {
        await addDoc(collection(db, "schools"), {
          name: schoolName,
          county: judet,
          locality: localitate,
        });
        showSuccessMessage("Școala a fost adăugată cu succes!");
      }
      resetSchoolForm();
      fetchSchools();
    } catch (err) {
      console.error("Eroare la adăugarea/actualizarea școlii:", err);
      showSuccessMessage("Eroare la salvarea școlii!");
    }
  };

  const handleEditSchool = () => {
    const sc = schools.find((s) => s.id === selectedSchoolId);
    if (!sc) return;
    setSchoolName(sc.name || "");
    setJudet(sc.county || "");
    setLocalitate(sc.locality || "");
    setIsEditing(true);
    setShowAddSchoolForm(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedSchoolId || !schoolName || !judet || !localitate) return;
    try {
      await updateDoc(doc(db, "schools", selectedSchoolId), {
        name: schoolName,
        county: judet,
        locality: localitate,
      });
      showSuccessMessage("Școala a fost actualizată cu succes!");
      resetSchoolForm();
      fetchSchools();
    } catch (err) {
      console.error("Eroare la salvarea modificării:", err);
      showSuccessMessage("Eroare la salvarea modificării!");
    }
  };

  const handleCancelEdit = () => resetSchoolForm();

  const handleDeleteSchool = () => {
    if (!selectedSchoolId) return;

    setConfirmModal({
      isOpen: true,
      title: "Confirmare ștergere școală",
      message: "Sigur doriți să ștergeți această școală și toți elevii înscriși? Această acțiune este ireversibilă.",
      onConfirm: async () => {
        try {
          const qReg = query(collection(db, "registration"), where("schoolId", "==", selectedSchoolId));
          const qSnap = await getDocs(qReg);
          for (const regDoc of qSnap.docs) {
            await deleteDoc(regDoc.ref);
          }
          await deleteDoc(doc(db, "schools", selectedSchoolId));
          setSelectedSchoolId("");
          setShowStudentEditor(false);
          setStudents([]);
          showSuccessMessage("Școala a fost ștearsă cu succes!");
          fetchSchools();
        } catch (err) {
          console.error("Eroare la ștergerea școlii/elevilor:", err);
          showSuccessMessage("Eroare la ștergerea școlii!");
        }
        setConfirmModal({ ...confirmModal, isOpen: false });
      },
    });
  };

  // ====== STATISTICI / ȘCOLI ÎNSCRISE ======
  const toggleStatistics = () => {
    if (!showStatistics) fetchStatistics();
    setShowStatistics((v) => !v);
  };

  const fetchStatistics = async () => {
    try {
      const regsSnap = await getDocs(collection(db, "registration"));
      const classCounts = { "a IV-a": 0, "a V-a": 0, "a VI-a": 0, "a VII-a": 0 };
      const schoolSet = new Set();

      regsSnap.docs.forEach((r) => {
        const d = r.data();
        schoolSet.add(d.schoolId);
        if (classCounts[d.class] !== undefined) {
          classCounts[d.class] += Array.isArray(d.students) ? d.students.length : 0;
        }
      });

      setStatistics({
        totalSchools: schoolSet.size,
        ...classCounts,
        totalStudents: Object.values(classCounts).reduce((a, n) => a + n, 0),
      });
    } catch (err) {
      console.error("Eroare la obținerea statisticilor:", err);
    }
  };

  const fetchRegisteredSchools = async () => {
    try {
      setLoadingRegs(true);
      const [schoolsSnap, regsSnap] = await Promise.all([getDocs(collection(db, "schools")), getDocs(collection(db, "registration"))]);

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

  // ====== EXPORT SIMPLIFICAT ======
  const exportSimplifiedList = async () => {
    try {
      const [regsSnap, schoolsSnap] = await Promise.all([
        getDocs(collection(db, "registration")),
        getDocs(collection(db, "schools"))
      ]);

      const schoolById = {};
      schoolsSnap.forEach((s) => {
        schoolById[s.id] = {
          name: s.data().name || "",
        };
      });

      const rows = [
        {
          nrCurent: "Nr. Curent",
          numePrenume: "Numele și Prenumele elevului",
          clasa: "Clasa",
          scoala: "Numele Școlii Participante",
          profesorIndrumator: "Profesor îndrumător",
        },
      ];

      let rowNumber = 1;

      for (const regDoc of regsSnap.docs) {
        const data = regDoc.data();
        const sc = schoolById[data.schoolId] || { name: "" };
        const studentsArr = Array.isArray(data.students) ? data.students : [];

        for (const st of studentsArr) {
          const nume = typeof st === "string" ? st : st?.nume || "";
          rows.push({
            nrCurent: rowNumber++,
            numePrenume: nume,
            clasa: data.class || "",
            scoala: sc.name,
            profesorIndrumator: data.profesorIndrumatorEmail || "",
          });
        }
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);

      // Setare lățimi coloane
      ws["!cols"] = [
        { wch: 10 },  // Nr. Curent
        { wch: 35 },  // Numele și Prenumele
        { wch: 12 },  // Clasa
        { wch: 45 },  // Școala
        { wch: 30 },  // Profesor îndrumător
      ];

      // Autofilter și freeze
      ws["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(ws["!ref"])) };
      ws["!freeze"] = { xSplit: 0, ySplit: 1 };

      XLSX.utils.book_append_sheet(wb, ws, "Lista Participanți");
      XLSX.writeFile(wb, "lista_participanti_simplificata.xlsx");
    } catch (err) {
      console.error("Eroare la exportul listei simplificate:", err);
    }
  };

  // ====== EXPORT ÎNDRUMĂTORI ======
  const exportInstrumatoriToExcel = async () => {
    try {
      const [regsSnap, schoolsSnap] = await Promise.all([
        getDocs(collection(db, "registration")),
        getDocs(collection(db, "schools")),
      ]);

      const schoolById = {};
      schoolsSnap.forEach((s) => {
        schoolById[s.id] = {
          name: s.data().name || "",
          county: s.data().county || "",
          locality: s.data().locality || "",
        };
      });

      const instrumatoriMap = new Map();

      regsSnap.forEach((regDoc) => {
        const data = regDoc.data();
        const email = data.profesorIndrumatorEmail || "";
        const telefon = data.telefon || "";
        const sc = schoolById[data.schoolId] || { name: "", county: "", locality: "" };

        if (email) {
          if (!instrumatoriMap.has(email)) {
            instrumatoriMap.set(email, {
              email: email,
              telefon: telefon,
              scoala: sc.name,
              localitate: sc.locality,
              judet: sc.county,
            });
          }
        }
      });

      const rows = Array.from(instrumatoriMap.values()).sort((a, b) => a.scoala.localeCompare(b.scoala, "ro", { sensitivity: "base" }));

      const excelData = [
        {
          nrCrt: "Nr. crt",
          scoala: "Școala",
          localitate: "Localitate",
          judet: "Județ",
          email: "Email Profesor Îndrumător",
          telefon: "Telefon",
        },
        ...rows.map((row, idx) => ({
          nrCrt: idx + 1,
          scoala: row.scoala,
          localitate: row.localitate,
          judet: row.judet,
          email: row.email,
          telefon: row.telefon,
        })),
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);

      const maxWidths = [{ wch: 8 }, { wch: 40 }, { wch: 20 }, { wch: 15 }, { wch: 30 }, { wch: 15 }];
      ws["!cols"] = maxWidths;
      ws["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(ws["!ref"])) };
      ws["!freeze"] = { xSplit: 0, ySplit: 1 };

      XLSX.utils.book_append_sheet(wb, ws, "Profesori Îndrumători");
      XLSX.writeFile(wb, "profesori_indrumatori.xlsx");
    } catch (err) {
      console.error("Eroare la exportul profesorilor îndrumători:", err);
    }
  };

  // ====== EXPORT EXCEL COMPLET ======
  const exportToExcel = async () => {
    try {
      const [regsSnap, schoolsSnap] = await Promise.all([getDocs(collection(db, "registration")), getDocs(collection(db, "schools"))]);

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
        const studentsArr = Array.isArray(data.students) ? data.students : [];

        countBySchool.set(data.schoolId, (countBySchool.get(data.schoolId) || 0) + studentsArr.length);

        for (const st of studentsArr) {
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

      const fitCols = (arr) =>
        Object.keys(arr[0] || {}).map((k) => ({
          wch: Math.max(k.length, ...arr.slice(1).map((r) => (r[k] ? String(r[k]).length : 0))) + 2,
        }));

      const wb = XLSX.utils.book_new();

      const ws1 = XLSX.utils.json_to_sheet(rows);
      ws1["!cols"] = fitCols(rows);
      ws1["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(ws1["!ref"])) };
      ws1["!freeze"] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, ws1, "Elevi Înscriși");

      const summary = [["Școala", "Localitate", "Județ", "Nr. elevi"]];
      for (const [schoolId, cnt] of countBySchool.entries()) {
        const sc = schoolById[schoolId] || { name: "", county: "", locality: "" };
        summary.push([sc.name, sc.locality, sc.county, cnt]);
      }
      const ws2 = XLSX.utils.aoa_to_sheet([summary[0], ...summary.slice(1).sort((a, b) => b[3] - a[3])]);
      ws2["!cols"] = fitCols([
        { a: "Școala", b: "Localitate", c: "Județ", d: "Nr. elevi" },
        ...summary.slice(1).map((r) => ({ a: r[0], b: r[1], c: r[2], d: String(r[3]) })),
      ]);
      ws2["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(ws2["!ref"])) };
      XLSX.utils.book_append_sheet(wb, ws2, "Școli – total");

      XLSX.writeFile(wb, "elevi_inscrisi.xlsx");
    } catch (err) {
      console.error("Eroare la exportul în Excel:", err);
    }
  };

  // ====== BULK UPLOAD ȘCOLI ======
  const handleBulkUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheet = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);

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
      setTimeout(() => setBulkUploadStatus(null), 3000);
    } catch (err) {
      console.error("Eroare la încărcarea bulk:", err);
      setBulkUploadStatus("Eroare la încărcarea bulk a școlilor.");
      setTimeout(() => setBulkUploadStatus(null), 3000);
    }
  };

  // ====== EDITOR ELEV — încărcare ======
  const handleEditStudents = async () => {
    if (!selectedSchoolId) return;
    try {
      const qRegs = query(collection(db, "registration"), where("schoolId", "==", selectedSchoolId));
      const snap = await getDocs(qRegs);

      const list = [];
      snap.forEach((reg) => {
        const d = reg.data();
        const arr = Array.isArray(d.students) ? d.students : [];
        arr.forEach((student, index) => {
          const nume = typeof student === "string" ? student : student?.nume || "";
          list.push({ id: `${reg.id}-${index}`, nume });
        });
      });

      setStudents(list);
      setShowStudentEditor(true);
    } catch (err) {
      console.error("Eroare la aducerea elevilor:", err);
    }
  };

  // ====== EDITOR ELEV — autosave nume ======
  const doSaveStudentName = async (studentId, newName) => {
    const [registrationId, idxStr] = studentId.split("-");
    const idx = parseInt(idxStr, 10);
    const regRef = doc(db, "registration", registrationId);

    try {
      setSaveStatus((m) => ({ ...m, [studentId]: "saving" }));

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(regRef);
        if (!snap.exists()) throw new Error("registration missing");

        const data = snap.data();
        const arr = Array.isArray(data.students) ? [...data.students] : [];
        if (Number.isNaN(idx) || idx < 0 || idx >= arr.length) throw new Error("index out of range");

        const prev = arr[idx];
        arr[idx] = typeof prev === "object" ? { ...prev, nume: newName } : newName;

        tx.update(regRef, { students: arr });
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
    const prev = saveTimersRef.current[studentId];
    if (prev) clearTimeout(prev);
    saveTimersRef.current[studentId] = setTimeout(() => {
      doSaveStudentName(studentId, newName);
    }, 700);
  };

  // ====== EDITOR ELEV — ștergere elev ======
  const handleDeleteStudent = (studentId) => {
    setConfirmModal({
      isOpen: true,
      title: "Confirmare ștergere elev",
      message: "Sigur doriți să ștergeți acest elev din sistem?",
      onConfirm: async () => {
        const [registrationId, idxStr] = studentId.split("-");
        const idx = parseInt(idxStr, 10);
        const regRef = doc(db, "registration", registrationId);

        try {
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(regRef);
            if (!snap.exists()) return;

            const data = snap.data();
            const arr = Array.isArray(data.students) ? [...data.students] : [];
            if (Number.isNaN(idx) || idx < 0 || idx >= arr.length) return;

            const updated = arr.filter((_, i) => i !== idx);
            if (updated.length === 0) {
              tx.delete(regRef);
            } else {
              tx.update(regRef, { students: updated });
            }
          });

          setStudents((prev) => prev.filter((s) => s.id !== studentId));
        } catch (e) {
          console.error("Eroare la ștergerea elevului:", e);
        }
        setConfirmModal({ ...confirmModal, isOpen: false });
      },
    });
  };

  return (
    <div>
      {/* ✅ Modal de confirmare */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />

      <div className={styles.container}>
        <h1 className={styles.title}>Bine ai venit în panoul de administrare!</h1>

        {/* ✅ Mesaj de confirmare pentru operațiuni școală */}
        {schoolOperationMessage && <p className={styles.successMessage}>{schoolOperationMessage}</p>}

        {/* Butoane acțiuni - Grid responsive */}
        <div className={styles.buttonContainer}>
          <button onClick={() => setShowAddSchoolForm((v) => !v)} className={styles.addButton}>
            {showAddSchoolForm ? "Ascunde formularul" : "Adaugă o școală"}
          </button>

          <button onClick={toggleStatistics} className={styles.statsButton}>
            {showStatistics ? "Ascunde situație înscrieri" : "Situație înscrieri"}
          </button>

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

          {/* ✅ NOU - Buton export simplificat */}
          <button onClick={exportSimplifiedList} className={styles.exportButton}>
            Descarcă lista simplificată
          </button>

          <button onClick={exportInstrumatoriToExcel} className={styles.exportButton}>
            Descarcă profesori îndrumători
          </button>

          <button onClick={() => document.querySelector(`.${styles.fileInput}`)?.click()} className={styles.bulkUploadButton}>
            Încarcă școli din Excel
          </button>
        </div>

        <input type="file" accept=".xlsx, .xls" onChange={handleBulkUpload} className={styles.fileInput} />
        {bulkUploadStatus && <p className={styles.successMessage}>{bulkUploadStatus}</p>}

        {/* Formular adăugare / editare școală */}
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

        {/* Statistici */}
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

        {/* Școli înscrise */}
        {showRegisteredSchools && (
          <div className={styles.registeredSchoolsContainer}>
            <h2>Școli cu elevi înscriși</h2>
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

        {/* Selector școală */}
        <h2 className={styles.schoolListTitle}>Lista școlilor:</h2>
        <div className={styles.dropdownContainer}>
          <select
            value={selectedSchoolId}
            onChange={(e) => {
              setSelectedSchoolId(e.target.value);
              setShowStudentEditor(false);
              setStudents([]);
            }}
            className={styles.dropdown}
          >
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

        {/* Editor elevi */}
        {showStudentEditor && (
          <div className={styles.studentList}>
            <h2>Elevi înscriși:</h2>
            {students.length > 0 ? (
              students.map((student) => {
                const st = saveStatus[student.id];
                return (
                  <div key={student.id} className={styles.studentItem}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                      <span
                        title={st === "saving" ? "Se salvează…" : st === "saved" ? "Salvat" : st === "error" ? "Eroare" : "OK"}
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: st === "saving" ? "#f39c12" : st === "saved" ? "#2ecc71" : st === "error" ? "#e74c3c" : "#bdc3c7",
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
                    <button onClick={() => handleDeleteStudent(student.id)} className={styles.deleteButton} disabled={st === "saving"}>
                      Șterge
                    </button>
                  </div>
                );
              })
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