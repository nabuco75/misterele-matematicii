// AdminDashboard.jsx
import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
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
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import * as XLSX from "xlsx";
import ConfirmModal from "./ConfirmModal.jsx";
import RoomAllocation from "./RoomAllocation.jsx";
import AllocationProcess from "./AllocationProcess.jsx";
import Grading from "./Grading.jsx";
import ClassForm from "./ClassForm.jsx";
import { applyRemovals, applyRenames } from "./studentSync";
import { cleanTeacherName, teacherKey, validateTeacher } from "./teachers";
import { displayName } from "./nameFormat";
import TeacherSearch from "./TeacherSearch.jsx";
import { StageBar, StageCards } from "./StageNav.jsx";
import styles from "./AdminDashboard.module.css";

// iconița de fișier Excel (foaie verde cu X) pentru butoanele de descărcare
const ExcelIcon = () => (
  <svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true">
    <path d="M10 3h13l6 6v18a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="#21a366" />
    <path d="M23 3l6 6h-4a2 2 0 0 1-2-2z" fill="#185c37" />
    <path d="M14 13h12M14 18h12M14 23h12M20 11v14" stroke="#fff" strokeOpacity=".45" strokeWidth="1.2" />
    <rect x="2" y="9" width="15" height="15" rx="2.5" fill="#107c41" />
    <path d="M6 12.5l7 8M13 12.5l-7 8" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

function AdminDashboard() {
  // ------------------------------------------------------------------
  // 1. STARE NAVIGARE
  // 'dashboard' sau o etapă: 'sali' | 'repartizare' | 'coduri' | 'tiparire' | 'notare'
  const [currentView, setCurrentView] = useState("dashboard");
  const goHome = () => setCurrentView("dashboard");
  const location = useLocation();

  // butonul „Admin Dashboard” din bara de sus readuce panoul principal din orice ecran
  useEffect(() => {
    if (location.state?.backToDashboard) setCurrentView("dashboard");
  }, [location.state]);
  // ------------------------------------------------------------------

  // —— Școli / selecție / form școală
  const [schools, setSchools] = useState([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");

  const [showAddSchoolForm, setShowAddSchoolForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  // școala deschisă la „Editează” (nu cea selectată acum în listă)
  const [editingSchoolId, setEditingSchoolId] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [judet, setJudet] = useState("");
  const [localitate, setLocalitate] = useState("");

  // —— Mesaje de confirmare pentru operațiuni școală
  const [schoolOperationMessage, setSchoolOperationMessage] =
    useState(null);

  // —— Statistici / listă școli înscrise
  const [statistics, setStatistics] = useState(null);
  const [showStatistics, setShowStatistics] = useState(false);

  const [showRegisteredSchools, setShowRegisteredSchools] =
    useState(false);
  const [registeredSchools, setRegisteredSchools] = useState([]);
  // școlile din listă care nu au niciun elev înscris
  const [showSchoolsWithoutRegs, setShowSchoolsWithoutRegs] =
    useState(false);
  const [schoolsWithoutRegs, setSchoolsWithoutRegs] = useState([]);
  const [loadingRegs, setLoadingRegs] = useState(false);

  // —— Bulk upload
  const [bulkUploadStatus, setBulkUploadStatus] = useState(null);

  // —— Editor elevi
  const [showStudentEditor, setShowStudentEditor] = useState(false);
  const [students, setStudents] = useState([]);
  const [originalStudents, setOriginalStudents] = useState([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [studentEditorMessage, setStudentEditorMessage] =
    useState(null);
  // înscrierile (documentele din "registration") ale școlii selectate
  const [schoolRegs, setSchoolRegs] = useState([]);
  // școala-destinație aleasă pentru mutare, per înscriere: { regId: schoolId }
  const [moveTargets, setMoveTargets] = useState({});
  // editarea profesorului îndrumător al unei înscrieri: { regId, nume, email, telefon, applyAll }
  const [profEdit, setProfEdit] = useState(null);
  const [showTeacherSearch, setShowTeacherSearch] = useState(false);
  const [profEditError, setProfEditError] = useState("");

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
    setEditingSchoolId("");
    setShowAddSchoolForm(false);
  };

  const handleAddOrEditSchool = async (e) => {
    e.preventDefault();
    if (!schoolName || !judet || !localitate) return;

    try {
      if (isEditing && editingSchoolId) {
        await updateDoc(doc(db, "schools", editingSchoolId), {
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
    setEditingSchoolId(sc.id);
    setIsEditing(true);
    setShowAddSchoolForm(true);
  };

  const handleSaveEdit = async () => {
    if (!editingSchoolId || !schoolName || !judet || !localitate)
      return;
    try {
      await updateDoc(doc(db, "schools", editingSchoolId), {
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
          if (showRegisteredSchools || showSchoolsWithoutRegs)
            fetchRegisteredSchools();
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
      const [regsSnap, schoolsSnap] = await Promise.all([
        getDocs(collection(db, "registration")),
        getDocs(collection(db, "schools")),
      ]);

      // mapare schoolId -> info școală (judet, localitate)
      const schoolById = {};
      schoolsSnap.forEach((s) => {
        const d = s.data();
        schoolById[s.id] = {
          county: d.county || "",
          locality: d.locality || "",
        };
      });

      const classCounts = {
        "a IV-a": 0,
        "a V-a": 0,
        "a VI-a": 0,
        "a VII-a": 0,
      };
      const schoolSet = new Set();
      const countiesSet = new Set();
      const localitiesSet = new Set();

      regsSnap.docs.forEach((r) => {
        const d = r.data();

        // școala
        if (d.schoolId) {
          schoolSet.add(d.schoolId);

          const info = schoolById[d.schoolId];
          if (info) {
            const county = (info.county || "").trim();
            const locality = (info.locality || "").trim();

            if (county) countiesSet.add(county);
            // localitate unică în combinație cu județul
            if (locality) {
              localitiesSet.add(
                county ? `${locality} (${county})` : locality
              );
            }
          }
        }

        // număr elevi / clasă
        if (classCounts[d.class] !== undefined) {
          classCounts[d.class] += Array.isArray(d.students)
            ? d.students.length
            : 0;
        }
      });

      setStatistics({
        totalSchools: schoolSet.size,
        uniqueCounties: countiesSet.size,
        uniqueLocalities: localitiesSet.size,
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

      const withoutRegs = Object.values(schoolMap)
        .filter((s) => s.count === 0)
        .sort(
          (a, b) =>
            a.county.localeCompare(b.county, "ro", { sensitivity: "base" }) ||
            a.locality.localeCompare(b.locality, "ro", {
              sensitivity: "base",
            }) ||
            a.name.localeCompare(b.name, "ro", { sensitivity: "base" })
        );

      setRegisteredSchools(list);
      setSchoolsWithoutRegs(withoutRegs);
    } catch (e) {
      console.error("Eroare la încărcarea școlilor înscrise:", e);
    } finally {
      setLoadingRegs(false);
    }
  };

  // ====== EXPORT ȘCOLI FĂRĂ ÎNSCRIERI ======
  const exportSchoolsWithoutRegs = () => {
    const excelData = [
      {
        nrCrt: "Nr. crt",
        scoala: "Școala",
        localitate: "Localitate",
        judet: "Județ",
      },
      ...schoolsWithoutRegs.map((s, idx) => ({
        nrCrt: idx + 1,
        scoala: s.name,
        localitate: s.locality,
        judet: s.county,
      })),
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData, { skipHeader: true });
    ws["!cols"] = [{ wch: 8 }, { wch: 45 }, { wch: 25 }, { wch: 15 }];
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range(XLSX.utils.decode_range(ws["!ref"])),
    };
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, "Școli fără înscrieri");
    XLSX.writeFile(wb, "scoli_fara_inscrieri.xlsx");
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
          const nume = typeof st === "string" ? st : st?.nume || "";
          rows.push({
            nrCurent: rowNumber++,
            numePrenume: displayName(nume),
            clasa: data.class || "",
            scoala: sc.name,
            profesorIndrumator: displayName(
              data.profesorIndrumatorEmail || ""
            ),
          });
        }
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: true });

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
      window.alert("❌ Lista simplificată nu s-a putut descărca. Verificați conexiunea la internet și încercați din nou.");
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
        // "profesorIndrumatorEmail" conține, istoric, NUMELE profesorului;
        // emailul real e în "profesorEmail" (doar la înscrierile noi).
        const nume = (data.profesorIndrumatorEmail || "").trim();
        const email = (data.profesorEmail || "").trim();
        const telefon = data.telefon || "";
        const sc = schoolById[data.schoolId] || {
          name: "",
          county: "",
          locality: "",
        };

        if (nume || email) {
          // un profesor = același nume la aceeași școală
          // (fără diferențe de majuscule, diacritice sau spații multiple)
          const numeNorm = nume
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .replace(/\s+/g, " ");
          const key = `${numeNorm}|${data.schoolId || ""}`;
          const existing = instrumatoriMap.get(key);
          if (!existing) {
            instrumatoriMap.set(key, {
              nume,
              email,
              telefon: telefon,
              scoala: sc.name,
              localitate: sc.locality,
              judet: sc.county,
            });
          } else if (!existing.email && email) {
            existing.email = email;
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
          nume: "Profesor Îndrumător",
          email: "Email",
          telefon: "Telefon",
        },
        ...rows.map((row, idx) => ({
          nrCrt: idx + 1,
          scoala: row.scoala,
          localitate: row.localitate,
          judet: row.judet,
          nume: displayName(row.nume),
          email: row.email,
          telefon: row.telefon,
        })),
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData, { skipHeader: true });

      const maxWidths = [
        { wch: 8 },
        { wch: 40 },
        { wch: 20 },
        { wch: 15 },
        { wch: 30 },
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
      window.alert("❌ Lista profesorilor îndrumători nu s-a putut descărca. Verificați conexiunea la internet și încercați din nou.");
    }
  };

  // 🌟 NOU: EXPORT LISTĂ ȘCOLI PARTICIPANTE
  const exportParticipatingSchools = async () => {
    try {
      const [schoolsSnap, regsSnap] = await Promise.all([
        getDocs(collection(db, "schools")),
        getDocs(collection(db, "registration")),
      ]);

      const schoolMap = {};
      schoolsSnap.forEach((s) => {
        const d = s.data();
        schoolMap[s.id] = {
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
        .sort(
          (a, b) =>
            b.count - a.count ||
            a.name.localeCompare(b.name, "ro", {
              sensitivity: "base",
            })
        );

      const excelData = [
        {
          nrCrt: "Nr. crt",
          scoala: "Școala",
          localitate: "Localitate",
          judet: "Județ",
          nrElevi: "Nr. elevi",
        },
        ...list.map((s, idx) => ({
          nrCrt: idx + 1,
          scoala: s.name,
          localitate: s.locality,
          judet: s.county,
          nrElevi: s.count,
        })),
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData, { skipHeader: true });

      ws["!cols"] = [
        { wch: 8 },
        { wch: 40 },
        { wch: 25 },
        { wch: 15 },
        { wch: 12 },
      ];
      ws["!autofilter"] = {
        ref: XLSX.utils.encode_range(
          XLSX.utils.decode_range(ws["!ref"])
        ),
      };
      ws["!freeze"] = { xSplit: 0, ySplit: 1 };

      XLSX.utils.book_append_sheet(
        wb,
        ws,
        "Școli participante"
      );
      XLSX.writeFile(wb, "scoli_participante.xlsx");
    } catch (err) {
      console.error(
        "Eroare la exportul școlilor participante:",
        err
      );
      window.alert("❌ Lista școlilor participante nu s-a putut descărca. Verificați conexiunea la internet și încercați din nou.");
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
          (countBySchool.get(data.schoolId) || 0) +
            studentsArr.length
        );

        for (const st of studentsArr) {
          const nume = typeof st === "string" ? st : st?.nume || "";
          const tel =
            typeof st === "object"
              ? st?.telefon || data.telefon || ""
              : data.telefon || "";
          rows.push({
            nrCrt: rowNumber++,
            elev: displayName(nume),
            clasa: data.class || "",
            scoala: sc.name,
            localitate: sc.locality,
            judet: sc.county,
            profesorIndrumator: displayName(
              data.profesorIndrumatorEmail || ""
            ),
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

      const ws1 = XLSX.utils.json_to_sheet(rows, { skipHeader: true });
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
      window.alert("❌ Lista elevilor înscriși nu s-a putut descărca. Verificați conexiunea la internet și încercați din nou.");
    }
  };

  // ====== BULK UPLOAD ȘCOLI ======
  const handleBulkUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // permite reîncărcarea aceluiași fișier (altfel onChange nu se declanșează)
    e.target.value = "";
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheet = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(
        workbook.Sheets[firstSheet]
      );

      // evităm dublurile: comparăm cu școlile existente (citire proaspătă)
      // și cu rândurile deja procesate din același fișier
      const norm = (v) =>
        String(v ?? "")
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
      const schoolKey = (name, county, locality) =>
        `${norm(name)}|${norm(county)}|${norm(locality)}`;

      const existingSnap = await getDocs(collection(db, "schools"));
      const seen = new Set(
        existingSnap.docs.map((s) => {
          const d = s.data();
          return schoolKey(d.name, d.county, d.locality);
        })
      );

      let skipped = 0;
      const toAdd = [];
      rows.forEach((row) => {
        if (!(row.Nume && row.Județ && row.Localitate)) return;
        const key = schoolKey(row.Nume, row.Județ, row.Localitate);
        if (seen.has(key)) {
          skipped++;
          return;
        }
        seen.add(key);
        toAdd.push({
          name: row.Nume,
          county: row.Județ,
          locality: row.Localitate,
        });
      });

      await Promise.all(
        toAdd.map((school) => addDoc(collection(db, "schools"), school))
      );
      setBulkUploadStatus(
        skipped
          ? `Școlile au fost încărcate cu succes! Adăugate: ${toAdd.length}, sărite (existau deja): ${skipped}.`
          : "Școlile au fost încărcate cu succes!"
      );
      fetchSchools();
      setTimeout(() => setBulkUploadStatus(null), skipped ? 6000 : 3000);
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
      const regs = [];
      const docs = [...snap.docs].sort(
        (a, b) => (a.data().createdAt || 0) - (b.data().createdAt || 0)
      );
      docs.forEach((reg) => {
        const d = reg.data();
        const arr = Array.isArray(d.students) ? d.students : [];
        regs.push({
          id: reg.id,
          class: d.class || "",
          profesor: d.profesorIndrumatorEmail || "",
          profesorEmail: d.profesorEmail || "",
          telefon: d.telefon || "",
          count: arr.length,
          createdAt: d.createdAt || null,
        });
        arr.forEach((student, index) => {
          const nume =
            typeof student === "string"
              ? student
              : student?.nume || "";
          list.push({ id: `${reg.id}-${index}`, nume, class: d.class || "" });
        });
      });

      setSchoolRegs(regs);
      setMoveTargets({});
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

          // numele corectate: elevul își păstrează sala, codul și notele
          const renames = students
            .map((st) => {
              const before = originalStudents.find((o) => o.id === st.id);
              return before && before.nume !== st.nume
                ? { regId: st.id.split("-")[0], oldName: before.nume, newName: st.nume }
                : null;
            })
            .filter(Boolean);
          let syncNote = "";
          if (renames.length > 0) {
            try {
              const r = await applyRenames(renames);
              const parts = [
                r.seats && `sala (${r.seats})`,
                r.codes && `codul (${r.codes})`,
                r.grades && `notele (${r.grades})`,
              ].filter(Boolean);
              if (parts.length > 0) syncNote = ` Elevii redenumiți și-au păstrat ${parts.join(", ")}.`;
            } catch (syncErr) {
              console.error("Eroare la actualizarea repartizării/codurilor:", syncErr);
              syncNote =
                " ⚠️ Repartizarea/codurile nu s-au putut actualiza — confirmați numele corectate din pagina Repartizare.";
            }
          }

          setOriginalStudents(JSON.parse(JSON.stringify(students)));
          setHasUnsavedChanges(false);
          showStudentEditorMessage(
            `✅ Modificările au fost salvate cu succes!${syncNote}`,
            "success"
          );
        } catch (err) {
          console.error("Eroare la salvarea modificărilor:", err);
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
      message: "Sigur doriți să ștergeți acest elev din sistem?",
      onConfirm: async () => {
        const [registrationId, idxStr] = studentId.split("-");
        const idx = parseInt(idxStr, 10);
        const regRef = doc(db, "registration", registrationId);
        // numele așa cum era în baza de date la deschiderea editorului
        const expectedName =
          originalStudents.find((s) => s.id === studentId)?.nume;

        try {
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(regRef);
            if (!snap.exists()) return;

            const data = snap.data();
            const arr = Array.isArray(data.students)
              ? [...data.students]
              : [];
            if (Number.isNaN(idx) || idx < 0 || idx >= arr.length)
              return;

            // siguranță: nu ștergem dacă pe poziția respectivă e alt elev
            const current = arr[idx];
            const currentName =
              typeof current === "string" ? current : current?.nume || "";
            if (expectedName !== undefined && currentName !== expectedName) {
              throw new Error("STALE_STUDENT_LIST");
            }

            const updated = arr.filter((_, i) => i !== idx);
            if (updated.length === 0) {
              tx.delete(regRef);
            } else {
              tx.update(regRef, { students: updated });
            }
          });

          // după ștergere, elevii următori din aceeași înscriere
          // se mută cu o poziție mai sus în baza de date → actualizăm ID-urile
          const reindex = (list) =>
            list
              .filter((s) => s.id !== studentId)
              .map((s) => {
                const [rId, iStr] = s.id.split("-");
                const i = parseInt(iStr, 10);
                return rId === registrationId && i > idx
                  ? { ...s, id: `${rId}-${i - 1}` }
                  : s;
              });

          setStudents(reindex);
          setOriginalStudents(reindex);
          // elevul scos nu mai ocupă loc în sală; codul lui devine „retras”
          let syncNote = "";
          if (expectedName) {
            try {
              const r = await applyRemovals([{ regId: registrationId, nume: expectedName }]);
              if (r.seats || r.codes) {
                syncNote = ` Locul din sală a fost eliberat${r.codes ? ", iar codul a fost retras" : ""}.`;
              }
            } catch (syncErr) {
              console.error("Eroare la eliberarea locului:", syncErr);
            }
          }
          showStudentEditorMessage(
            `✅ Elevul a fost șters cu succes!${syncNote}`,
            "success"
          );
        } catch (e) {
          console.error("Eroare la ștergerea elevului:", e);
          showStudentEditorMessage(
            e?.message === "STALE_STUDENT_LIST"
              ? "⚠️ Lista de elevi s-a modificat între timp. Închideți și redeschideți editorul, apoi reîncercați."
              : "❌ Eroare la ștergerea elevului!",
            "error"
          );
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // ====== ÎNSCRIERI ÎNTREGI (ștergere / mutare la altă școală) ======
  // scoate din editor înscrierea și elevii ei, după ce a fost ștearsă sau mutată
  const removeRegFromEditor = (regId) => {
    const keep = (list) => list.filter((s) => !s.id.startsWith(`${regId}-`));
    setStudents(keep);
    setOriginalStudents(keep);
    setSchoolRegs((prev) => prev.filter((r) => r.id !== regId));
  };

  const describeReg = (reg) =>
    `clasa ${reg.class}, prof. ${reg.profesor || "—"}, ${reg.count} ${
      reg.count === 1 ? "elev" : "elevi"
    }`;

  const handleDeleteRegistration = (reg) => {
    if (hasUnsavedChanges) {
      showStudentEditorMessage(
        "⚠️ Salvați sau anulați întâi modificările de nume.",
        "error"
      );
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: "Ștergere înscriere",
      message: `Sigur ștergeți înscrierea (${describeReg(
        reg
      )}) de la ${selectedSchool?.name}? Toți elevii din ea vor fi șterși. Acțiunea este ireversibilă.`,
      onConfirm: async () => {
        try {
          const removed = originalStudents
            .filter((st) => st.id.startsWith(`${reg.id}-`))
            .map((st) => ({ regId: reg.id, nume: st.nume }));
          await deleteDoc(doc(db, "registration", reg.id));
          removeRegFromEditor(reg.id);
          // elevii înscrierii nu mai ocupă loc în săli; codurile lor devin „retrase”
          try {
            await applyRemovals(removed);
          } catch (syncErr) {
            console.error("Eroare la eliberarea locurilor:", syncErr);
          }
          showStudentEditorMessage(
            "✅ Înscrierea a fost ștearsă.",
            "success"
          );
          if (showStatistics) fetchStatistics();
          if (showRegisteredSchools) fetchRegisteredSchools();
        } catch (e) {
          console.error("Eroare la ștergerea înscrierii:", e);
          showStudentEditorMessage(
            "❌ Eroare la ștergerea înscrierii!",
            "error"
          );
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // ====== PROFESOR ÎNDRUMĂTOR (nume, email, telefon) ======
  const sameProf = (a, b) => teacherKey(a) === teacherKey(b);

  // celelalte înscrieri de la aceeași școală, cu același profesor
  const otherRegsOfProf = (reg) =>
    schoolRegs.filter((r) => r.id !== reg.id && r.profesor && sameProf(r.profesor, reg.profesor));

  const startProfEdit = (reg) => {
    setProfEdit({
      regId: reg.id,
      nume: reg.profesor || "",
      email: reg.profesorEmail || "",
      telefon: reg.telefon || "",
      applyAll: true,
    });
    setProfEditError("");
  };

  const handleSaveProfEdit = () => {
    if (!profEdit) return;
    const reg = schoolRegs.find((r) => r.id === profEdit.regId);
    if (!reg) return;
    const err = validateTeacher(profEdit);
    if (err) {
      setProfEditError(err);
      return;
    }
    const nume = cleanTeacherName(profEdit.nume);
    const email = profEdit.email.trim();
    const telefon = profEdit.telefon.trim();
    const others = otherRegsOfProf(reg);
    const targets = profEdit.applyAll ? [reg, ...others] : [reg];
    const changes = [
      nume !== (reg.profesor || "") && `numele: „${reg.profesor || "—"}” → „${nume}”`,
      email !== (reg.profesorEmail || "") && `emailul: ${reg.profesorEmail || "—"} → ${email || "—"}`,
      telefon !== (reg.telefon || "") && `telefonul: ${reg.telefon || "—"} → ${telefon || "—"}`,
    ].filter(Boolean);
    if (changes.length === 0) {
      setProfEditError("Nu ați modificat nimic.");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "Modificare profesor îndrumător",
      message: `Se modifică ${changes.join("; ")}, pentru ${
        targets.length === 1 ? "această înscriere" : `${targets.length} înscrieri (${targets.map((r) => `clasa ${r.class}`).join(", ")})`
      }. Numele nou va apărea pe listele din săli, pe borderouri și la note. Continuați?`,
      onConfirm: async () => {
        try {
          setIsSaving(true);
          const batch = writeBatch(db);
          targets.forEach((r) =>
            batch.update(doc(db, "registration", r.id), {
              profesorIndrumatorEmail: nume,
              profesorEmail: email,
              telefon,
            })
          );
          // codurile de anonimizare păstrează și ele numele profesorului (pentru borderou)
          for (const r of targets) {
            const codesSnap = await getDocs(query(collection(db, "codes"), where("regId", "==", r.id)));
            codesSnap.forEach((c) => batch.update(c.ref, { profesor: nume }));
          }
          await batch.commit();

          const ids = new Set(targets.map((r) => r.id));
          setSchoolRegs((prev) =>
            prev.map((r) => (ids.has(r.id) ? { ...r, profesor: nume, profesorEmail: email, telefon } : r))
          );
          setProfEdit(null);
          setProfEditError("");
          showStudentEditorMessage(
            `✅ Profesorul îndrumător a fost actualizat (${targets.length} ${targets.length === 1 ? "înscriere" : "înscrieri"}).`,
            "success"
          );
        } catch (e) {
          console.error("Eroare la modificarea profesorului:", e);
          showStudentEditorMessage("❌ Eroare la modificarea profesorului!", "error");
        } finally {
          setIsSaving(false);
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  const handleMoveRegistration = (reg) => {
    const targetId = moveTargets[reg.id];
    const target = schools.find((s) => s.id === targetId);
    if (!target) return;
    if (hasUnsavedChanges) {
      showStudentEditorMessage(
        "⚠️ Salvați sau anulați întâi modificările de nume.",
        "error"
      );
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: "Mutare înscriere la altă școală",
      message: `Mutați înscrierea (${describeReg(reg)}) de la ${
        selectedSchool?.name
      } la ${target.name} (${target.locality}, ${
        target.county
      })? Elevii, profesorul și datele de contact rămân aceleași.`,
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, "registration", reg.id), {
            schoolId: target.id,
            school: target.name,
          });
          removeRegFromEditor(reg.id);
          showStudentEditorMessage(
            `✅ Înscrierea a fost mutată la ${target.name}.`,
            "success"
          );
          if (showStatistics) fetchStatistics();
          if (showRegisteredSchools) fetchRegisteredSchools();
        } catch (e) {
          console.error("Eroare la mutarea înscrierii:", e);
          showStudentEditorMessage(
            "❌ Eroare la mutarea înscrierii!",
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
          "Sigur doriți să ștergeți TOȚI elevii înscriși (și profesorii îndrumători asociați) din TOATE școlile? Această acțiune este IREVERSIBILĂ și va șterge toate înregistrările din sistem! Școlile și sălile rămân neatinse.",
        success: (count) =>
          `✅ Au fost șterse ${count} înregistrări (elevi + îndrumători)!`,
        error: "❌ Eroare la ștergerea elevilor!",
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

          showSuccessMessage(config.success(regsSnap.size));

          if (showStatistics) fetchStatistics();
          if (showRegisteredSchools || showSchoolsWithoutRegs)
            fetchRegisteredSchools();
        } catch (err) {
          console.error(`Eroare la ștergerea ${type}:`, err);
          showSuccessMessage(config.error);
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // ===========================================
  // 🌟 RENDER NAVIGARE
  // ===========================================

  // 1. ETAPA „SĂLI”
  if (currentView === "sali") {
    return (
      <RoomAllocation
        onNextStep={() => setCurrentView("repartizare")}
        stageBar={<StageBar current="sali" onGo={setCurrentView} onHome={goHome} />}
      />
    );
  }

  // 2–4. ETAPELE „REPARTIZARE”, „CODURI”, „TIPĂRIRE” – aceeași componentă (datele nu se reîncarcă la trecerea între ele)
  if (["repartizare", "coduri", "tiparire"].includes(currentView)) {
    return (
      <AllocationProcess
        section={currentView}
        onGo={setCurrentView}
        stageBar={<StageBar current={currentView} onGo={setCurrentView} onHome={goHome} />}
      />
    );
  }

  // 5. ETAPA „NOTARE”
  if (currentView === "notare") {
    return <Grading stageBar={<StageBar current="notare" onGo={setCurrentView} onHome={goHome} />} />;
  }

  // 4. VIZUALIZARE DASHBOARD
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

        <div className={styles.dash}>
          <StageCards onGo={setCurrentView} />
          {[
            {
              title: "Școli",
              tiles: [
                {
                  icon: showAddSchoolForm ? "✖️" : "➕",
                  label: showAddSchoolForm ? "Ascunde formularul" : "Adaugă o școală",
                  sub: "Școală nouă, manual",
                  color: "teal",
                  active: showAddSchoolForm,
                  onClick: () => setShowAddSchoolForm((v) => !v),
                },
                {
                  icon: "📤",
                  label: "Încarcă școli din Excel",
                  sub: "Import în masă",
                  color: "teal",
                  onClick: () => document.querySelector(`.${styles.fileInput}`)?.click(),
                },
                {
                  icon: "✅",
                  label: showRegisteredSchools ? "Ascunde școli înscrise" : "Școli înscrise",
                  sub: "Cine a trimis elevi",
                  color: "green",
                  active: showRegisteredSchools,
                  onClick: async () => {
                    await fetchRegisteredSchools();
                    setShowRegisteredSchools((v) => !v);
                  },
                },
                {
                  icon: "⏳",
                  label: showSchoolsWithoutRegs ? "Ascunde școli fără înscrieri" : "Școli fără înscrieri",
                  sub: "Cine încă lipsește",
                  color: "orange",
                  active: showSchoolsWithoutRegs,
                  onClick: async () => {
                    if (!showSchoolsWithoutRegs) await fetchRegisteredSchools();
                    setShowSchoolsWithoutRegs((v) => !v);
                  },
                },
              ],
            },
            {
              title: "Înscrieri și liste",
              tiles: [
                {
                  icon: showTeacherSearch ? "✖️" : "🔎",
                  label: showTeacherSearch ? "Închide căutarea" : "Caută profesor sau elev",
                  sub: "Corectează profesori și elevi, din orice școală",
                  color: "indigo",
                  active: showTeacherSearch,
                  onClick: () => setShowTeacherSearch((v) => !v),
                },
                {
                  icon: "📊",
                  label: showStatistics ? "Ascunde situația" : "Situație înscrieri",
                  sub: "Statistici pe clase și școli",
                  color: "violet",
                  active: showStatistics,
                  onClick: toggleStatistics,
                },
                {
                  icon: "🧑‍🎓",
                  label: "Elevii înscriși",
                  sub: "Excel complet",
                  color: "blue",
                  download: true,
                  onClick: exportToExcel,
                },
                {
                  icon: "📋",
                  label: "Lista simplificată",
                  sub: "Excel, doar esențialul",
                  color: "blue",
                  download: true,
                  onClick: exportSimplifiedList,
                },
                {
                  icon: "👩‍🏫",
                  label: "Profesori îndrumători",
                  sub: "Excel cu profesorii",
                  color: "blue",
                  download: true,
                  onClick: exportInstrumatoriToExcel,
                },
                {
                  icon: "🏛️",
                  label: "Școlile participante",
                  sub: "Excel cu școlile",
                  color: "blue",
                  download: true,
                  onClick: exportParticipatingSchools,
                },
              ],
            },
          ].map((section) => (
            <section key={section.title} className={styles.dashSection}>
              <h2 className={styles.dashTitle}>{section.title}</h2>
              <div className={`${styles.tileGrid} ${section.hero ? styles.tileGridHero : ""}`}>
                {section.tiles.map((t) => (
                  <button
                    key={t.sub}
                    onClick={t.onClick}
                    className={`${styles.tile} ${styles[`tile_${t.color}`]} ${
                      section.hero ? styles.tileHero : ""
                    } ${t.active ? styles.tileActive : ""}`}
                  >
                    <span className={styles.tileIcon}>{t.icon}</span>
                    <span className={styles.tileText}>
                      <span className={styles.tileLabel}>{t.label}</span>
                      <span className={styles.tileSub}>{t.sub}</span>
                    </span>
                    {t.download && (
                      <span className={styles.tileExcel} title="Descarcă Excel">
                        <ExcelIcon />
                        <span className={styles.tileExcelArrow}>⬇</span>
                      </span>
                    )}
                    {section.hero && <span className={styles.tileArrow}>→</span>}
                  </button>
                ))}
              </div>
            </section>
          ))}

          {/* Elevii și profesorii îndrumători sunt salvați în aceleași
              înregistrări, deci un singur buton le șterge pe toate. */}
          <section className={`${styles.dashSection} ${styles.dangerZone}`}>
            <h2 className={styles.dashTitle}>Zonă periculoasă</h2>
            <button
              onClick={() => handleDeleteAllRegistrations("elevi")}
              className={`${styles.tile} ${styles.tile_red}`}
            >
              <span className={styles.tileIcon}>🗑️</span>
              <span className={styles.tileText}>
                <span className={styles.tileLabel}>Șterge toate înscrierile</span>
                <span className={styles.tileSub}>Elevi + îndrumători — nu se poate anula</span>
              </span>
            </button>
          </section>
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
              onChange={(e) => setSchoolName(e.target.value)}
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
              onChange={(e) => setLocalitate(e.target.value)}
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
              Număr județe unice:{" "}
              {statistics.uniqueCounties}
            </p>
            <p>
              Număr localități unice:{" "}
              {statistics.uniqueLocalities}
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

        {showTeacherSearch && <TeacherSearch />}

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

        {showSchoolsWithoutRegs && (
          <div className={styles.registeredSchoolsContainer}>
            <h2>
              Școli fără niciun elev înscris
              {!loadingRegs && ` (${schoolsWithoutRegs.length})`}
            </h2>
            {loadingRegs ? (
              <p>Se încarcă...</p>
            ) : schoolsWithoutRegs.length === 0 ? (
              <p>Toate școlile din listă au cel puțin un elev înscris.</p>
            ) : (
              <>
                <button
                  onClick={exportSchoolsWithoutRegs}
                  className={styles.exportButton}
                >
                  Descarcă lista în Excel
                </button>
                <table className={styles.schoolTable}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Școala</th>
                      <th>Localitate</th>
                      <th>Județ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schoolsWithoutRegs.map((s, i) => (
                      <tr key={s.id}>
                        <td>{i + 1}</td>
                        <td>{s.name}</td>
                        <td>{s.locality}</td>
                        <td>{s.county}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
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
              // altă școală aleasă → editarea școlii anterioare se închide
              if (isEditing) {
                setIsEditing(false);
                setEditingSchoolId("");
                setShowAddSchoolForm(false);
                setSchoolName("");
                setJudet("");
                setLocalitate("");
              }
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
              onClick={() => setShowAdminEnroll((v) => !v)}
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
                    hasUnsavedChanges ? styles.hasChanges : ""
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
                  {hasUnsavedChanges ? "Anulează" : "Închide"}
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

            {schoolRegs.length > 0 && (
              <div className={styles.regList}>
                <h3>Înscrieri ({schoolRegs.length})</h3>
                <p className={styles.regHint}>
                  Puteți corecta profesorul îndrumător (nume, email, telefon). Dacă
                  un profesor a ales școala greșită, mutați înscrierea la școala
                  corectă sau ștergeți-o.
                </p>
                {schoolRegs.map((reg) => (
                  <div key={reg.id} className={styles.regItem}>
                    <div className={styles.regInfo}>
                      <strong>Clasa {reg.class}</strong> · prof.{" "}
                      {reg.profesor || "—"} · {reg.count}{" "}
                      {reg.count === 1 ? "elev" : "elevi"}
                      {reg.createdAt && (
                        <span className={styles.regDate}>
                          {" "}
                          · {new Date(reg.createdAt).toLocaleString("ro-RO")}
                        </span>
                      )}
                      {reg.profesorEmail && (
                        <span className={styles.regDate}>
                          {" "}
                          · {reg.profesorEmail}
                        </span>
                      )}
                      {reg.telefon && (
                        <span className={styles.regDate}> · {reg.telefon}</span>
                      )}
                    </div>

                    {profEdit?.regId === reg.id && (
                      <div className={styles.profEdit}>
                        <div className={styles.profEditTitle}>
                          ✏️ Profesor îndrumător — clasa {reg.class}
                        </div>
                        <div className={styles.profEditFields}>
                          <label>
                            Nume și prenume
                            <input
                              type="text"
                              value={profEdit.nume}
                              onChange={(e) => {
                                setProfEdit((prev) => ({ ...prev, nume: e.target.value }));
                                setProfEditError("");
                              }}
                              placeholder="ex: Popescu Maria"
                              autoFocus
                            />
                          </label>
                          <label>
                            Email
                            <input
                              type="email"
                              value={profEdit.email}
                              onChange={(e) => {
                                setProfEdit((prev) => ({ ...prev, email: e.target.value }));
                                setProfEditError("");
                              }}
                              placeholder="ex: maria.popescu@gmail.com"
                            />
                          </label>
                          <label>
                            Telefon
                            <input
                              type="tel"
                              value={profEdit.telefon}
                              onChange={(e) => {
                                setProfEdit((prev) => ({ ...prev, telefon: e.target.value }));
                                setProfEditError("");
                              }}
                              placeholder="ex: 0740 123 456"
                            />
                          </label>
                        </div>
                        {otherRegsOfProf(reg).length > 0 && (
                          <label className={styles.profEditAll}>
                            <input
                              type="checkbox"
                              checked={profEdit.applyAll}
                              onChange={(e) =>
                                setProfEdit((prev) => ({ ...prev, applyAll: e.target.checked }))
                              }
                            />
                            Aplică și la celelalte {otherRegsOfProf(reg).length}{" "}
                            {otherRegsOfProf(reg).length === 1 ? "înscriere" : "înscrieri"} ale acestui profesor
                            la această școală (
                            {otherRegsOfProf(reg)
                              .map((r) => `clasa ${r.class}`)
                              .join(", ")}
                            )
                          </label>
                        )}
                        {profEditError && <p className={styles.profEditError}>⚠️ {profEditError}</p>}
                        <div className={styles.regActions}>
                          <button
                            onClick={handleSaveProfEdit}
                            disabled={isSaving}
                            className={styles.profSaveButton}
                          >
                            💾 Salvează
                          </button>
                          <button
                            onClick={() => {
                              setProfEdit(null);
                              setProfEditError("");
                            }}
                            className={styles.cancelButton}
                          >
                            Renunță
                          </button>
                        </div>
                      </div>
                    )}

                    <div className={styles.regActions}>
                      {profEdit?.regId !== reg.id && (
                        <button
                          onClick={() => startProfEdit(reg)}
                          disabled={isSaving}
                          className={styles.editButton}
                        >
                          ✏️ Editează profesorul
                        </button>
                      )}
                      <select
                        value={moveTargets[reg.id] || ""}
                        onChange={(e) =>
                          setMoveTargets((prev) => ({
                            ...prev,
                            [reg.id]: e.target.value,
                          }))
                        }
                        className={styles.regSelect}
                      >
                        <option value="">Mută la școala…</option>
                        {schools
                          .filter((s) => s.id !== selectedSchoolId)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} - {s.county} - {s.locality}
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={() => handleMoveRegistration(reg)}
                        disabled={!moveTargets[reg.id] || isSaving}
                        className={styles.editButton}
                      >
                        Mută
                      </button>
                      <button
                        onClick={() => handleDeleteRegistration(reg)}
                        disabled={isSaving}
                        className={styles.deleteStudentButton}
                      >
                        Șterge înscrierea
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {students.length === 0 ? (
              <p>Niciun elev înscris sub această școală.</p>
            ) : (
              <table className={styles.studentTable}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Clasa</th>
                    <th>Nume și Prenume</th>
                    <th>Acțiuni</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student, index) => (
                    <tr key={student.id}>
                      <td>{index + 1}</td>
                      <td>{student.class}</td>
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
                            handleDeleteStudent(student.id)
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
