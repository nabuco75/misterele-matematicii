// AdminDashboard.jsx
import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";
import * as XLSX from "xlsx";
import ConfirmModal from "./ConfirmModal.jsx";
import RoomAllocation from "./RoomAllocation.jsx";
import AllocationProcess from "./AllocationProcess.jsx";
import ClassForm from "./ClassForm.jsx";
import styles from "./AdminDashboard.module.css";

function AdminDashboard() {
  // ------------------------------------------------------------------
  // 1. STARE NAVIGARE
  // 'dashboard' | 'rooms' | 'allocation'
  const [currentView, setCurrentView] = useState("dashboard");
  // ------------------------------------------------------------------

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
  const [originalStudents, setOriginalStudents] = useState([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [studentEditorMessage, setStudentEditorMessage] = useState(null);

  // —— Form de înscriere suplimentară (ADMIN)
  const [showAdminEnroll, setShowAdminEnroll] = useState(false);

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
  }, []);

  // școala selectată ca obiect
  const selectedSchool =
    schools.find((s) => s.id === selectedSchoolId) || null;

  // ====== FETCH ȘCOLI ======
  const fetchSchools = async () => {
    try {
      const snap = await getDocs(collection(db, "schools"));
      const list = snap.docs.map((s) => ({ id: s.id, ...s.data() }));

      list.sort(
        (a, b) =>
          (a.county || "").localeCompare(b.county || "", "ro", {
            sensitivity: "base",
          }) ||
          (a.locality || "").localeCompare(b.locality || "", "ro", {
            sensitivity: "base",
          }) ||
          (a.name || "").localeCompare(b.name || "", "ro", {
            sensitivity: "base",
          })
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

  // ====== HELPER: Afișare mesaj în editor elevi ======
  const showStudentEditorMessage = (message, type = "success") => {
    setStudentEditorMessage({ text: message, type });
    setTimeout(() => {
      setStudentEditorMessage(null);
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
      message:
        "Sigur doriți să ștergeți această școală și toți elevii înscriși? Această acțiune este ireversibilă.",
      onConfirm: async () => {
        try {
          const qReg = query(
            collection(db, "registration"),
            where("schoolId", "==", selectedSchoolId)
          );
          const qSnap = await getDocs(qReg);
          for (const regDoc of qSnap.docs) {
            await deleteDoc(regDoc.ref);
          }
          await deleteDoc(doc(db, "schools", selectedSchoolId));
          setSelectedSchoolId("");
          setShowStudentEditor(false);
          setShowAdminEnroll(false);
          setStudents([]);
          showSuccessMessage("Școala a fost ștearsă cu succes!");

          // Actualizare date
          fetchSchools();
          if (showStatistics) fetchStatistics();
          if (showRegisteredSchools) fetchRegisteredSchools();
        } catch (err) {
          console.error("Eroare la ștergerea școlii/elevilor:", err);
          showSuccessMessage("Eroare la ștergerea școlii!");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
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
      const classCounts = {
        "a IV-a": 0,
        "a V-a": 0,
        "a VI-a": 0,
        "a VII-a": 0,
      };
      const schoolSet = new Set();

      regsSnap.docs.forEach((r) => {
        const d = r.data();
        schoolSet.add(d.schoolId);
        if (classCounts[d.class] !== undefined) {
          classCounts[d.class] += Array.isArray(d.students)
            ? d.students.length
            : 0;
        }
      });

      setStatistics({
        totalSchools: schoolSet.size,
        ...classCounts,
        totalStudents: Object.values(classCounts).reduce(
          (a, n) => a + n,
          0
        ),
      });
    } catch (err) {
      console.error("Eroare la obținerea statisticilor:", err);
    }
  };

  const fetchRegisteredSchools = async () => {
    try {
      setLoadingRegs(true);
      const [schoolsSnap, regsSnap] = await Promise.all([
        getDocs(collection(db, "schools")),
        getDocs(collection(db, "registration")),
      ]);

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
        getDocs(collection(db, "schools")),
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
        const studentsArr = Array.isArray(data.students)
          ? data.students
          : [];

        for (const st of studentsArr) {
          const nume =
            typeof st === "string" ? st : st?.nume || "";
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

      ws["!cols"] = [
        { wch: 10 },
        { wch: 35 },
        { wch: 12 },
        { wch: 45 },
        { wch: 30 },
      ];

      ws["!autofilter"] = {
        ref: XLSX.utils.encode_range(
          XLSX.utils.decode_range(ws["!ref"])
        ),
      };
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
        const sc = schoolById[data.schoolId] || {
          name: "",
          county: "",
          locality: "",
        };

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

      const rows = Array.from(instrumatoriMap.values()).sort(
        (a, b) =>
          a.scoala.localeCompare(b.scoala, "ro", {
            sensitivity: "base",
          })
      );

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

      const maxWidths = [
        { wch: 8 },
        { wch: 40 },
        { wch: 20 },
        { wch: 15 },
        { wch: 30 },
        { wch: 15 },
      ];
      ws["!cols"] = maxWidths;
      ws["!autofilter"] = {
        ref: XLSX.utils.encode_range(
          XLSX.utils.decode_range(ws["!ref"])
        ),
      };
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
        const sc = schoolById[data.schoolId] || {
          name: "",
          county: "",
          locality: "",
        };
        const studentsArr = Array.isArray(data.students)
          ? data.students
          : [];

        countBySchool.set(
          data.schoolId,
          (countBySchool.get(data.schoolId) || 0) + studentsArr.length
        );

        for (const st of studentsArr) {
          const nume =
            typeof st === "string" ? st : st?.nume || "";
          const tel =
            typeof st === "object"
              ? st?.telefon || data.telefon || ""
              : data.telefon || "";
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
          wch:
            Math.max(
              k.length,
              ...arr
                .slice(1)
                .map((r) => (r[k] ? String(r[k]).length : 0))
            ) + 2,
        }));

      const wb = XLSX.utils.book_new();

      const ws1 = XLSX.utils.json_to_sheet(rows);
      ws1["!cols"] = fitCols(rows);
      ws1["!autofilter"] = {
        ref: XLSX.utils.encode_range(
          XLSX.utils.decode_range(ws1["!ref"])
        ),
      };
      ws1["!freeze"] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, ws1, "Elevi Înscriși");

      const summary = [["Școala", "Localitate", "Județ", "Nr. elevi"]];
      for (const [schoolId, cnt] of countBySchool.entries()) {
        const sc = schoolById[schoolId] || {
          name: "",
          county: "",
          locality: "",
        };
        summary.push([sc.name, sc.locality, sc.county, cnt]);
      }
      const ws2 = XLSX.utils.aoa_to_sheet([
        summary[0],
        ...summary.slice(1).sort((a, b) => b[3] - a[3]),
      ]);
      ws2["!cols"] = fitCols([
        {
          a: "Școala",
          b: "Localitate",
          c: "Județ",
          d: "Nr. elevi",
        },
        ...summary.slice(1).map((r) => ({
          a: r[0],
          b: r[1],
          c: r[2],
          d: String(r[3]),
        })),
      ]);
      ws2["!autofilter"] = {
        ref: XLSX.utils.encode_range(
          XLSX.utils.decode_range(ws2["!ref"])
        ),
      };
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
      const rows = XLSX.utils.sheet_to_json(
        workbook.Sheets[firstSheet]
      );

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
      setBulkUploadStatus(
        "Eroare la încărcarea bulk a școlilor."
      );
      setTimeout(() => setBulkUploadStatus(null), 3000);
    }
  };

  // ====== EDITOR ELEV ======
  const handleEditStudents = async () => {
    if (!selectedSchoolId) return;
    try {
      const qRegs = query(
        collection(db, "registration"),
        where("schoolId", "==", selectedSchoolId)
      );
      const snap = await getDocs(qRegs);

      const list = [];
      snap.forEach((reg) => {
        const d = reg.data();
        const arr = Array.isArray(d.students) ? d.students : [];
        arr.forEach((student, index) => {
          const nume =
            typeof student === "string"
              ? student
              : student?.nume || "";
          list.push({ id: `${reg.id}-${index}`, nume });
        });
      });

      setStudents(list);
      setOriginalStudents(JSON.parse(JSON.stringify(list)));
      setHasUnsavedChanges(false);
      setShowStudentEditor(true);
      setShowAdminEnroll(false);
    } catch (err) {
      console.error("Eroare la aducerea elevilor:", err);
    }
  };

  const handleStudentNameChange = (studentId, newName) => {
    setStudents((prev) =>
      prev.map((s) =>
        s.id === studentId ? { ...s, nume: newName } : s
      )
    );
    setHasUnsavedChanges(true);
  };

  const handleSaveStudentChanges = () => {
    if (!hasUnsavedChanges) return;

    setConfirmModal({
      isOpen: true,
      title: "Confirmare salvare modificări",
      message:
        "Sigur doriți să salvați toate modificările efectuate asupra elevilor?",
      onConfirm: async () => {
        try {
          setIsSaving(true);

          const changesByReg = {};
          students.forEach((student) => {
            const [regId, idxStr] = student.id.split("-");
            if (!changesByReg[regId]) {
              changesByReg[regId] = [];
            }
            changesByReg[regId].push({
              index: parseInt(idxStr, 10),
              nume: student.nume,
            });
          });

          for (const [regId, changes] of Object.entries(
            changesByReg
          )) {
            const regRef = doc(db, "registration", regId);

            await runTransaction(db, async (tx) => {
              const snap = await tx.get(regRef);
              if (!snap.exists()) return;

              const data = snap.data();
              const arr = Array.isArray(data.students)
                ? [...data.students]
                : [];

              changes.forEach(({ index, nume }) => {
                if (index >= 0 && index < arr.length) {
                  const prev = arr[index];
                  arr[index] =
                    typeof prev === "object"
                      ? { ...prev, nume }
                      : nume;
                }
              });

              tx.update(regRef, { students: arr });
            });
          }

          setOriginalStudents(JSON.parse(JSON.stringify(students)));
          setHasUnsavedChanges(false);
          showStudentEditorMessage(
            "✅ Modificările au fost salvate cu succes!",
            "success"
          );
        } catch (err) {
          console.error(
            "Eroare la salvarea modificărilor:",
            err
          );
          showStudentEditorMessage(
            "❌ Eroare la salvarea modificărilor!",
            "error"
          );
        } finally {
          setIsSaving(false);
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  const handleCancelStudentChanges = () => {
    if (!hasUnsavedChanges) {
      setShowStudentEditor(false);
      setStudents([]);
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "Anulare modificări",
      message:
        "Aveți modificări nesalvate. Sigur doriți să renunțați la ele?",
      onConfirm: () => {
        setStudents(JSON.parse(JSON.stringify(originalStudents)));
        setHasUnsavedChanges(false);
        setShowStudentEditor(false);
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleDeleteStudent = (studentId) => {
    setConfirmModal({
      isOpen: true,
      title: "Confirmare ștergere elev",
      message:
        "Sigur doriți să ștergeți acest elev din sistem?",
      onConfirm: async () => {
        const [registrationId, idxStr] = studentId.split("-");
        const idx = parseInt(idxStr, 10);
        const regRef = doc(db, "registration", registrationId);

        try {
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(regRef);
            if (!snap.exists()) return;

            const data = snap.data();
            const arr = Array.isArray(data.students)
              ? [...data.students]
              : [];
            if (
              Number.isNaN(idx) ||
              idx < 0 ||
              idx >= arr.length
            )
              return;

            const updated = arr.filter((_, i) => i !== idx);
            if (updated.length === 0) {
              tx.delete(regRef);
            } else {
              tx.update(regRef, { students: updated });
            }
          });

          setStudents((prev) =>
            prev.filter((s) => s.id !== studentId)
          );
          setOriginalStudents((prev) =>
            prev.filter((s) => s.id !== studentId)
          );
          showStudentEditorMessage(
            "✅ Elevul a fost șters cu succes!",
            "success"
          );
        } catch (e) {
          console.error("Eroare la ștergerea elevului:", e);
          showStudentEditorMessage(
            "❌ Eroare la ștergerea elevului!",
            "error"
          );
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // ====== ȘTERGERE ÎN MASĂ ======
  const handleDeleteAllRegistrations = (type = "elevi") => {
    const messages = {
      elevi: {
        title: "⚠️ ATENȚIE: Ștergere completă elevi",
        message:
          "Sigur doriți să ștergeți TOȚI elevii înscriși din TOATE școlile? Această acțiune este IREVERSIBILĂ și va șterge toate înregistrările de elevi din sistem!",
        success: (count) =>
          `✅ Au fost șterse ${count} înregistrări de elevi!`,
        error: "❌ Eroare la ștergerea elevilor!",
      },
      indrumatori: {
        title: "⚠️ ATENȚIE: Ștergere completă îndrumători",
        message:
          "Sigur doriți să ștergeți TOȚI profesorii îndrumători și elevii asociați din sistem? Această acțiune va șterge TOATE înregistrările din baza de date și este IREVERSIBILĂ!",
        success: (count) =>
          `✅ Au fost șterse ${count} înregistrări (îndrumători + elevi)!`,
        error: "❌ Eroare la ștergerea datelor!",
      },
    };

    const config = messages[type];

    setConfirmModal({
      isOpen: true,
      title: config.title,
      message: config.message,
      onConfirm: async () => {
        try {
          const regsSnap = await getDocs(
            collection(db, "registration")
          );
          const deletePromises = regsSnap.docs.map((docu) =>
            deleteDoc(docu.ref)
          );
          await Promise.all(deletePromises);

          setShowStudentEditor(false);
          setShowAdminEnroll(false);
          setStudents([]);
          setOriginalStudents([]);
          setHasUnsavedChanges(false);

          showSuccessMessage(
            config.success(regsSnap.size)
          );

          if (showStatistics) fetchStatistics();
          if (showRegisteredSchools) fetchRegisteredSchools();
        } catch (err) {
          console.error(
            `Eroare la ștergerea ${type}:`,
            err
          );
          showSuccessMessage(config.error);
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // ===========================================
  // 🌟 RENDER NAVIGARE
  // ===========================================

  // 1. VIZUALIZARE REPARTIZARE SĂLI
  if (currentView === "rooms") {
    return (
      <RoomAllocation
        onNextStep={() => setCurrentView("allocation")}
        onCancel={() => setCurrentView("dashboard")}
      />
    );
  }

  // 2. VIZUALIZARE PROCES REPARTIZARE
  if (currentView === "allocation") {
    return (
      <AllocationProcess
        onBack={() => setCurrentView("rooms")}
      />
    );
  }

  // 3. VIZUALIZARE DASHBOARD
  return (
    <div>
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() =>
          setConfirmModal((prev) => ({ ...prev, isOpen: false }))
        }
      />

      <div className={styles.container}>
        <h1 className={styles.title}>
          Bine ai venit în panoul de administrare!
        </h1>

        {schoolOperationMessage && (
          <p className={styles.successMessage}>
            {schoolOperationMessage}
          </p>
        )}

        <div className={styles.buttonContainer}>
          <button
            onClick={() => setShowAddSchoolForm((v) => !v)}
            className={styles.addButton}
          >
            {showAddSchoolForm
              ? "Ascunde formularul"
              : "Adaugă o școală"}
          </button>

          <button
            onClick={toggleStatistics}
            className={styles.statsButton}
          >
            {showStatistics
              ? "Ascunde situație înscrieri"
              : "Situație înscrieri"}
          </button>

          <button
            onClick={async () => {
              await fetchRegisteredSchools();
              setShowRegisteredSchools((v) => !v);
            }}
            className={styles.statsButton}
          >
            {showRegisteredSchools
              ? "Ascunde școli înscrise"
              : "Școli înscrise"}
          </button>

          <button
            onClick={exportToExcel}
            className={styles.exportButton}
          >
            Descarcă elevii înscriși
          </button>

          <button
            onClick={exportSimplifiedList}
            className={styles.exportButton}
          >
            Descarcă lista simplificată
          </button>

          <button
            onClick={exportInstrumatoriToExcel}
            className={styles.exportButton}
          >
            Descarcă profesori îndrumători
          </button>

          <button
            onClick={() => setCurrentView("rooms")}
            className={styles.addButton}
          >
            📋 Repartizare în săli
          </button>

          <button
            onClick={() =>
              document
                .querySelector(`.${styles.fileInput}`)
                ?.click()
            }
            className={styles.bulkUploadButton}
          >
            Încarcă școli din Excel
          </button>

          <button
            onClick={() =>
              handleDeleteAllRegistrations("elevi")
            }
            className={styles.dangerButton}
          >
            🗑️ Șterge toți elevii
          </button>

          <button
            onClick={() =>
              handleDeleteAllRegistrations("indrumatori")
            }
            className={styles.dangerButton}
          >
            🗑️ Șterge toți îndrumătorii
          </button>
        </div>

        <input
          type="file"
          accept=".xlsx, .xls"
          onChange={handleBulkUpload}
          className={styles.fileInput}
          style={{ display: "none" }}
        />
        {bulkUploadStatus && (
          <p className={styles.successMessage}>
            {bulkUploadStatus}
          </p>
        )}

        {showAddSchoolForm && (
          <form
            onSubmit={handleAddOrEditSchool}
            className={styles.formContainer}
          >
            <input
              type="text"
              value={schoolName}
              onChange={(e) =>
                setSchoolName(e.target.value)
              }
              placeholder="Nume școală"
              className={styles.inputField}
            />
            <input
              type="text"
              value={judet}
              onChange={(e) => setJudet(e.target.value)}
              placeholder="Județul școlii"
              className={styles.inputField}
            />
            <input
              type="text"
              value={localitate}
              onChange={(e) =>
                setLocalitate(e.target.value)
              }
              placeholder="Localitatea școlii"
              className={styles.inputField}
            />

            <div className={styles.formActions}>
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className={styles.submitButton}
                  >
                    Salvează
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className={styles.cancelButton}
                  >
                    Anulează
                  </button>
                </>
              ) : (
                <button
                  type="submit"
                  className={styles.submitButton}
                >
                  Adaugă
                </button>
              )}
            </div>
          </form>
        )}

        {showStatistics && statistics && (
          <div className={styles.statistics}>
            <h2>Statistici înscrieri</h2>
            <p>
              Număr total școli înscrise:{" "}
              {statistics.totalSchools}
            </p>
            <p>
              Număr elevi clasa a IV-a:{" "}
              {statistics["a IV-a"]}
            </p>
            <p>
              Număr elevi clasa a V-a:{" "}
              {statistics["a V-a"]}
            </p>
            <p>
              Număr elevi clasa a VI-a:{" "}
              {statistics["a VI-a"]}
            </p>
            <p>
              Număr elevi clasa a VII-a:{" "}
              {statistics["a VII-a"]}
            </p>
            <p>
              Total elevi înscriși:{" "}
              {statistics.totalStudents}
            </p>
          </div>
        )}

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

        <h2 className={styles.schoolListTitle}>
          Lista școlilor:
        </h2>
        <div className={styles.dropdownContainer}>
          <select
            value={selectedSchoolId}
            onChange={(e) => {
              setSelectedSchoolId(e.target.value);
              setShowStudentEditor(false);
              setShowAdminEnroll(false);
              setStudents([]);
            }}
            className={styles.dropdown}
          >
            <option value="" disabled>
              Selectează o școală
            </option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name} - {school.county} -{" "}
                {school.locality}
              </option>
            ))}
          </select>

          <div className={styles.buttonGroup}>
            <button
              onClick={handleDeleteSchool}
              disabled={!selectedSchoolId}
              className={styles.deleteButton}
            >
              Șterge școala selectată
            </button>
            <button
              onClick={handleEditSchool}
              disabled={!selectedSchoolId}
              className={styles.editButton}
            >
              Editează școala selectată
            </button>
            <button
              onClick={handleEditStudents}
              disabled={!selectedSchoolId}
              className={styles.editButton}
            >
              Editare Elevi
            </button>
            <button
              onClick={() =>
                setShowAdminEnroll((v) => !v)
              }
              disabled={!selectedSchoolId}
              className={styles.editButton}
            >
              {showAdminEnroll
                ? "Ascunde înscriere ADMIN"
                : "Înscrie suplimentar (ADMIN)"}
            </button>
          </div>
        </div>

        {showStudentEditor && (
          <div className={styles.studentEditorContainer}>
            <div className={styles.studentEditorHeader}>
              <h2>Elevi înscriși:</h2>
              <div className={styles.studentEditorActions}>
                <button
                  onClick={handleSaveStudentChanges}
                  disabled={!hasUnsavedChanges || isSaving}
                  className={`${styles.saveChangesButton} ${
                    hasUnsavedChanges
                      ? styles.hasChanges
                      : ""
                  }`}
                >
                  {isSaving
                    ? "Se salvează..."
                    : hasUnsavedChanges
                    ? "💾 Salvează modificările"
                    : "✓ Salvat"}
                </button>
                <button
                  onClick={handleCancelStudentChanges}
                  disabled={isSaving}
                  className={styles.cancelButton}
                >
                  {hasUnsavedChanges
                    ? "Anulează"
                    : "Închide"}
                </button>
              </div>
            </div>

            {studentEditorMessage && (
              <p
                className={
                  studentEditorMessage.type === "success"
                    ? styles.successMessage
                    : styles.errorMessage
                }
              >
                {studentEditorMessage.text}
              </p>
            )}

            {students.length === 0 ? (
              <p>Niciun elev înscris sub această școală.</p>
            ) : (
              <table className={styles.studentTable}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Nume și Prenume</th>
                    <th>Acțiuni</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student, index) => (
                    <tr key={student.id}>
                      <td>{index + 1}</td>
                      <td>
                        <input
                          type="text"
                          value={student.nume}
                          onChange={(e) =>
                            handleStudentNameChange(
                              student.id,
                              e.target.value
                            )
                          }
                          className={styles.studentInput}
                        />
                      </td>
                      <td>
                        <button
                          onClick={() =>
                            handleDeleteStudent(
                              student.id
                            )
                          }
                          className={
                            styles.deleteStudentButton
                          }
                          disabled={isSaving}
                        >
                          Șterge
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {showAdminEnroll && selectedSchool && (
          <div className={styles.studentEditorContainer}>
            <h2>
              Înscriere suplimentară (ADMIN) pentru:{" "}
              {selectedSchool.name}
            </h2>
            <ClassForm
              selectedSchool={selectedSchool}
              isAdminOverride={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
