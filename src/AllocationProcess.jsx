import React, { useState, useEffect, useRef } from "react";
import {
    collection,
    doc,
    getDocs,
    serverTimestamp,
    writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import styles from "./AllocationProcess.module.css";
import {
    allocateByClassPairs,
    allocateKeepingCodes,
    allocationStats,
    CLASS_ORDER,
    sortRooms,
} from "./allocation";
import {
    formatWhen,
    loadAllocation,
    logAllocationEvent,
    markBatchPrinted,
    saveAllocation,
    saveLastNewCodes,
    saveWalkIn,
} from "./allocationStore";
import {
    applyRemovals,
    applyRenames,
    cancelAnonymization,
    clearLastNewCodes,
    diffWithAllocation,
    reserveCodeNumbers,
} from "./studentSync";
import { AllocationLogCard, AllocationStatsView } from "./AllocationLog";
import { GRADES_COLLECTION, nameGradeId } from "./grading";
import AttendanceView from "./AttendanceView.jsx";
import ReportsView from "./ReportsView.jsx";
import PrizeMoneyCard from "./PrizeMoneyCard.jsx";
import BorderouriView from "./BorderouriView.jsx";
import {
    exportRoomsExcel,
    groupByRoom,
    printRoomsPdf,
    assignNewCodes,
    exportCodesExcel,
    printCodesPdf,
    openPrintWindow,
    escapeHtml,
    editionLine,
    CONTEST_TITLE,
    CODE_PREFIX,
    CLASS_COLORS,
} from "./roomLists";
import {
    CODES_COLLECTION,
    loadContestStudents,
    normName,
    loadHeader,
    saveHeader,
} from "./contestData";

function AllocationProcess({ onBack, onDashboard, section = "repartizare", onGo, stageBar }) {
    const [header, setHeader] = useState(loadHeader);
    const [loading, setLoading] = useState(true);
    const [students, setStudents] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [allocationResult, setAllocationResult] = useState(null);
    const [slipSearch, setSlipSearch] = useState("");
    // absenții bifați la Notare (id-urile notelor: cod sau elev_înscriere_nume)
    const [absentIds, setAbsentIds] = useState(new Set());
    const [placeChoice, setPlaceChoice] = useState({});
    const [walkInLog, setWalkInLog] = useState([]);
    const [showAttendance, setShowAttendance] = useState(false);
    const [showBorderouri, setShowBorderouri] = useState(false);
    const [showReports, setShowReports] = useState(false);
    const [roomSummaries, setRoomSummaries] = useState([]);
    const [message, setMessage] = useState(null);
    const [lastCodeN, setLastCodeN] = useState(0);
    const [orphanCodes, setOrphanCodes] = useState([]);
    const [retiredCodes, setRetiredCodes] = useState([]);
    // reconciliere: fantomă (înscriere|nume vechi) → id elev / "__removed" (scos) / "" (nedecis)
    const [reconcileChoice, setReconcileChoice] = useState({});
    const [reconciling, setReconciling] = useState(false);
    const [savingCodes, setSavingCodes] = useState(false);
    // lacăt contra dublu-click: o singură repartizare de elevi noi / dare de coduri o dată
    const busyRef = useRef(false);
    const [placingNew, setPlacingNew] = useState(false);
    const [saved, setSaved] = useState(null); // repartizarea salvată + jurnalul
    const [studentStats, setStudentStats] = useState(
        CLASS_ORDER.reduce((acc, cls) => ({ ...acc, [cls]: 0 }), { total: 0 })
    );

    useEffect(() => {
        loadData();
    }, []);

    const updateHeader = (field, value) => {
        setHeader((prev) => {
            const next = { ...prev, [field]: value };
            saveHeader(next);
            return next;
        });
    };

    const showMessage = (type, text, ms = 5000) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), ms);
    };

    // ====== ÎNCĂRCARE DATE ======
    const loadData = async () => {
        try {
            setLoading(true);

            // Elevi (cu codurile de anonimizare deja date)
            const data = await loadContestStudents();
            if (data.codesError) {
                showMessage("error", "❌ Codurile de anonimizare nu au putut fi citite.");
            }
            setLastCodeN(data.lastCodeN);
            setOrphanCodes(data.orphans);
            setRetiredCodes(data.retiredCodes || []);
            setReconcileChoice({});
            setStudents(data.students);
            loadAbsents();
            const stats = CLASS_ORDER.reduce((acc, cls) => ({ ...acc, [cls]: 0 }), {});
            data.students.forEach((s) => {
                if (stats[s.clasa] !== undefined) stats[s.clasa]++;
            });
            setStudentStats({ ...stats, total: data.students.length });

            // Săli
            const roomsSnap = await getDocs(collection(db, "rooms"));
            const roomsData = roomsSnap.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            }));
            // repartizarea începe de la parter, apoi etajele în ordine; pe etaj după numărul sălii
            const sorted = sortRooms(roomsData);
            setRooms(sorted);

            // repartizarea salvată: se reafișează (elevii veniți după ea doar se numără)
            try {
                let savedAlloc = await loadAllocation();
                const hasSaved = savedAlloc && savedAlloc.assignments.size > 0;
                if (hasSaved || data.students.some((s) => s.cod && s.salaCod)) {
                    const restored = allocateKeepingCodes(data.students, sorted, {
                        saved: savedAlloc?.assignments,
                        placeNew: false,
                    });
                    setAllocationResult(restored.data);
                    setRoomSummaries(restored.roomSummaries);
                    // repartizare făcută înainte de salvare: o reconstituim din sălile de la coduri
                    if (!hasSaved && restored.data.length > 0) {
                        savedAlloc = await saveAllocation({
                            data: restored.data,
                            roomSummaries: restored.roomSummaries,
                            rooms: sorted,
                            type: "din-coduri",
                            previous: savedAlloc,
                        });
                    }
                }
                setSaved(savedAlloc);
                setWalkInLog(savedAlloc?.walkIns || []);
            } catch (err) {
                console.error("Eroare la citirea repartizării salvate:", err);
                showMessage("error", "❌ Repartizarea salvată nu a putut fi citită.");
            }
        } catch (err) {
            console.error("Eroare la încărcarea datelor:", err);
            showMessage("error", "❌ Eroare la încărcarea datelor!");
        } finally {
            setLoading(false);
        }
    };

    const loadAbsents = async () => {
        try {
            const snap = await getDocs(collection(db, GRADES_COLLECTION));
            setAbsentIds(new Set(snap.docs.filter((d) => d.data().absent).map((d) => d.id)));
        } catch (err) {
            console.error("Eroare la citirea absenților:", err);
        }
    };

    // ====== GENEREAZĂ REPARTIZARE ======
    const handleGenerateAllocation = async () => {
        if (
            students.some((s) => s.cod) &&
            !window.confirm(
                "Se reface TOATĂ repartizarea: elevii pot ajunge în alte săli decât cele de pe listele deja printate.\n" +
                    "Se păstrează doar codurile (fiecare elev își păstrează codul).\n\n" +
                    "Pentru elevi veniți ulterior folosiți butonul „Repartizează elevii noi”, care îi lasă pe ceilalți pe loc.\n\n" +
                    "Refaceți totuși toată repartizarea?"
            )
        ) {
            return;
        }
        setLoading(true);

        const totalSeats = rooms.reduce(
            (sum, r) => sum + parseInt(r.seats || 0),
            0
        );

        if (students.length === 0) {
            showMessage(
                "warning",
                "Nu există elevi înscriși pentru repartizare."
            );
            setLoading(false);
            return;
        }

        if (rooms.length === 0) {
            showMessage("error", "Nu există săli configurate pentru repartizare.");
            setLoading(false);
            return;
        }

        if (students.length > totalSeats) {
            const cont = window.confirm(
                `⚠️ Număr insuficient de locuri! Elevi: ${students.length}, Locuri: ${totalSeats}. Continuați oricum?`
            );
            if (!cont) {
                setLoading(false);
                return;
            }
        }

        try {
            const result = allocateByClassPairs(students, rooms);

            setAllocationResult(result.data);
            setRoomSummaries(result.roomSummaries);
            try {
                setSaved(
                    await saveAllocation({
                        data: result.data,
                        roomSummaries: result.roomSummaries,
                        rooms,
                        type: "completa",
                        previous: saved,
                    })
                );
            } catch (err) {
                console.error("Eroare la salvarea repartizării:", err);
                showMessage("error", "❌ Repartizarea s-a făcut, dar nu s-a putut salva în baza de date.");
                return;
            }

            if (result.unallocated === 0) {
                showMessage(
                    "success",
                    `✅ Repartizare reușită! Toți cei ${result.allocated} elevi au fost așezați.`
                );
            } else {
                showMessage(
                    "warning",
                    `⚠️ ${result.allocated} elevi așezați, ${result.unallocated} nerepartizați (nu au mai fost locuri).`
                );
            }
        } catch (err) {
            console.error("Eroare la generarea repartizării:", err);
            showMessage("error", "❌ Eroare la generare.");
        } finally {
            setLoading(false);
        }
    };

    // ====== EXPORT LISTE PE SĂLI (Excel + PDF, cu antet) ======
    // pe lista de ușă: absenții (bifați la Notare) și elevii veniți pe loc sunt marcați
    const markedList = () => {
        const walkInById = new Map(walkInLog.map((w) => [w.id, w]));
        return (allocationResult || []).map((s) => ({
            ...s,
            absent: isAbsent(s),
            walkIn: walkInById.has(s.id),
            inLocul: walkInById.get(s.id)?.inLocul || null,
        }));
    };
    const handleExportExcel = (roomName) => {
        if (!allocationResult || allocationResult.length === 0) {
            showMessage("warning", "Nu există date de repartizare pentru export!");
            return;
        }
        const groups = groupByRoom(markedList(), rooms).filter(
            (g) => typeof roomName !== "string" || g.room.name === roomName
        );
        exportRoomsExcel(groups, header, typeof roomName === "string" ? roomName : null);
        showMessage("success", "✅ Exportul Excel a fost finalizat!");
    };

    const handleExportPdf = (roomName) => {
        if (!allocationResult || allocationResult.length === 0) {
            showMessage("warning", "Nu există date de repartizare pentru export!");
            return;
        }
        const groups = groupByRoom(markedList(), rooms).filter(
            (g) => !roomName || g.room.name === roomName
        );
        printRoomsPdf(
            groups,
            header,
            roomName ? `Lista_${roomName.replace(/\s+/g, "_")}` : "Repartizare_pe_Sali"
        );
    };

    // ====== LISTE CU CODURI (pentru comisie) ======
    // mode "toti": toți elevii, fără nicio marcare (absenții apar ca prezenți)
    // mode "prezenti": absenții (bifați la Notare) sunt scoși din liste
    const codeListGroups = (mode) => {
        const list = (allocationResult || [])
            .filter((st) => mode !== "prezenti" || !isAbsent(st))
            .map((st) => ({ ...st, absent: false, walkIn: false, inLocul: null }));
        return groupByRoom(list, rooms);
    };
    const codeListOpts = (mode) =>
        mode === "prezenti"
            ? { withCode: true, label: "LISTĂ CU CODURI · FĂRĂ ABSENȚI", fileBase: "Lista_coduri_fara_absenti" }
            : { withCode: true, label: "LISTĂ CU CODURI", fileBase: "Lista_coduri" };
    const handleCodeList = (mode, kind) => {
        const groups = codeListGroups(mode);
        if (groups.length === 0) {
            showMessage("warning", "Nu există elevi pentru listă!");
            return;
        }
        const opts = codeListOpts(mode);
        if (kind === "excel") {
            exportRoomsExcel(groups, header, null, opts);
            showMessage("success", "✅ Lista cu coduri a fost descărcată!");
        } else {
            printRoomsPdf(groups, header, opts.fileBase, opts);
        }
    };

    // ====== ELEVI NOI: ceilalți rămân în sala lor, noii merg în ultima sală ======
    const studentsWithCode = students.filter((s) => s.cod).length;
    // elevii care nu apar în repartizarea afișată (înscriși după ea)
    const placedIds = new Set((allocationResult || []).map((s) => s.id));
    // comparația cu repartizarea salvată: elevi cu adevărat noi, nume corectate, elevi scoși
    const diff = saved?.assignments
        ? diffWithAllocation(students, saved.assignments, orphanCodes)
        : null;
    const newStudents = diff
        ? diff.realNew.length
        : allocationResult
        ? students.filter((s) => !placedIds.has(s.id)).length
        : 0;
    const pendingPairs = diff ? diff.pairs.length : 0;

    const handleKeepAllocation = async () => {
        if (rooms.length === 0 || busyRef.current) return;
        busyRef.current = true;
        setPlacingNew(true);
        try {
            await placeNewStudents();
        } finally {
            busyRef.current = false;
            setPlacingNew(false);
        }
    };

    const placeNewStudents = async () => {
        if (pendingPairs > 0) {
            showMessage(
                "warning",
                `⚠️ Confirmați întâi cele ${pendingPairs} nume corectate (caseta „Nume corectate sau elevi scoși”), altfel elevii respectivi ar primi sală și cod nou.`,
                9000
            );
            return;
        }
        const result = allocateKeepingCodes(students, rooms, { saved: saved?.assignments });
        setAllocationResult(result.data);
        setRoomSummaries(result.roomSummaries);
        if (result.newcomers === 0) {
            showMessage("success", "✅ Repartizarea salvată: fiecare elev în sala lui.");
            return;
        }
        let merged = result;
        try {
            const newSaved = await saveAllocation({
                data: result.data,
                roomSummaries: result.roomSummaries,
                rooms,
                type: "elevi-noi",
                added: result.newcomers,
                previous: saved,
            });
            setSaved(newSaved);
            setWalkInLog(newSaved.walkIns);
            // include și ce a salvat între timp alt calculator
            merged = allocateKeepingCodes(students, rooms, { saved: newSaved.assignments, placeNew: false });
            setAllocationResult(merged.data);
            setRoomSummaries(merged.roomSummaries);
        } catch (err) {
            console.error("Eroare la salvarea repartizării:", err);
            showMessage("error", "❌ Elevii noi au fost așezați, dar repartizarea nu s-a putut salva.");
            return;
        }
        const where = result.placedNew.map(([sala, n]) => `${n} în ${sala}`).join(", ");
        const placedMsg =
            `✅ ${result.newcomers} elevi noi așezați (${where}); ceilalți au rămas pe loc.` +
            (result.overflow ? ` ⚠️ ${result.overflow} peste numărul de locuri — adăugați scaune sau o sală.` : "");
        // dacă anonimizarea e deja în lucru (există coduri), elevii noi primesc cod imediat
        if (studentsWithCode > 0) {
            await handleGenerateCodes(merged.data, { ask: false, intro: placedMsg, locked: true });
        } else {
            showMessage(result.overflow ? "warning" : "success", placedMsg);
        }
    };

    // ====== ELEV VENIT PE LOC: se așază în locul unui absent (sau pe un loc liber) ======
    const isAbsent = (st) => (st.cod && absentIds.has(st.cod)) || absentIds.has(nameGradeId(st));
    const roomAvailability = rooms
        .map((room) => {
            const inRoom = (allocationResult || []).filter((st) => st.sala === room.name);
            const absents = inRoom.filter(isAbsent);
            const seats = parseInt(room.seats || 0, 10) || 0;
            return {
                room,
                seats,
                count: inRoom.length,
                absents,
                free: Math.max(0, seats - inRoom.length),
                available: seats - (inRoom.length - absents.length),
            };
        })
        .filter((r) => r.available > 0);
    const roomsFor = (st) =>
        [...roomAvailability].sort(
            (a, b) =>
                b.absents.filter((x) => x.clasa === st.clasa).length -
                    a.absents.filter((x) => x.clasa === st.clasa).length ||
                b.absents.length - a.absents.length ||
                b.available - a.available
        );
    const roomLabel = (r, st) => {
        const same = r.absents.filter((x) => x.clasa === st.clasa).length;
        const parts = [];
        if (r.absents.length) {
            const byClass = {};
            r.absents.forEach((x) => (byClass[x.clasa] = (byClass[x.clasa] || 0) + 1));
            parts.push(
                `${r.absents.length} ${r.absents.length === 1 ? "absent" : "absenți"} (${Object.entries(byClass)
                    .map(([c, n]) => `${n} cls. ${c}`)
                    .join(", ")})`
            );
        }
        if (r.free) parts.push(`${r.free} ${r.free === 1 ? "loc liber" : "locuri libere"}`);
        return `${r.room.name}${r.room.floor ? ` (${r.room.floor})` : ""} — ${parts.join(" + ")} → ${r.available} disponibile${
            same ? " ★ absent din aceeași clasă" : ""
        }`;
    };
    const walkIns = diff ? diff.realNew : [];

    const handlePlaceOne = async (st) => {
        const options = roomsFor(st);
        // sala aleasă trebuie să mai aibă loc (alt elev poate fi pus între timp acolo)
        const chosen = options.find((r) => r.room.name === placeChoice[st.id]);
        const roomName = (chosen || options[0])?.room.name;
        if (!roomName || busyRef.current) return;
        if (pendingPairs > 0) {
            showMessage("warning", "⚠️ Confirmați întâi numele corectate (caseta de mai jos), apoi așezați elevul.", 9000);
            return;
        }
        if (!window.confirm(`Așezați pe ${st.nume} (clasa ${st.clasa}) în ${roomName}?\nPrimește imediat cod nou.`)) return;
        busyRef.current = true;
        setPlacingNew(true);
        try {
            const assignments = new Map(saved?.assignments || []);
            assignments.set(st.id, roomName);
            let result = allocateKeepingCodes(students, rooms, { saved: assignments, placeNew: false });
            setAllocationResult(result.data);
            setRoomSummaries(result.roomSummaries);
            let freshWalkIns = walkInLog;
            try {
                const newSaved = await saveAllocation({
                    data: result.data,
                    roomSummaries: result.roomSummaries,
                    rooms,
                    type: "elevi-noi",
                    added: 1,
                    previous: saved,
                });
                setSaved(newSaved);
                freshWalkIns = newSaved.walkIns;
                // include și ce a salvat între timp alt calculator
                result = allocateKeepingCodes(students, rooms, { saved: newSaved.assignments, placeNew: false });
                setAllocationResult(result.data);
                setRoomSummaries(result.roomSummaries);
            } catch (err) {
                console.error("Eroare la salvarea repartizării:", err);
                showMessage("error", "❌ Elevul nu a putut fi așezat (salvarea a eșuat). Încercați din nou.");
                return;
            }
            // în locul cui: întâi un absent din aceeași clasă, apoi orice absent din sală încă neînlocuit
            const usedCodes = new Set(freshWalkIns.map((w) => w.inLocul?.cod).filter(Boolean));
            const roomAbsents = result.data.filter(
                (x) => x.sala === roomName && x.cod && isAbsent(x) && !usedCodes.has(x.cod)
            );
            const replaced =
                roomAbsents.find((x) => x.clasa === st.clasa) || roomAbsents[0] || null;
            try {
                setWalkInLog(
                    await saveWalkIn(
                        {
                            id: st.id,
                            nume: st.nume,
                            clasa: st.clasa,
                            scoala: st.scoala,
                            sala: roomName,
                            inLocul: replaced
                                ? { cod: replaced.cod, nume: replaced.nume, clasa: replaced.clasa }
                                : null,
                            at: new Date().toISOString(),
                        }
                    )
                );
            } catch (err) {
                console.error("Eroare la salvarea înlocuirii:", err);
            }
            const intro = `✅ ${st.nume} a fost așezat în ${roomName}${
                replaced ? ` (în locul lui ${replaced.cod} ${replaced.nume}, absent)` : ""
            }. Bilețelul: Tipărire › „Tranșe de coduri” (sus).`;
            if (studentsWithCode > 0) {
                await handleGenerateCodes(result.data, { ask: false, intro, locked: true });
            } else {
                showMessage("success", intro, 12000);
            }
        } finally {
            busyRef.current = false;
            setPlacingNew(false);
        }
    };

    // ====== ANONIMIZARE (coduri MMVS_01 ...) ======
    const hasCodes = !!allocationResult?.some((s) => s.cod);
    const withoutCode = allocationResult
        ? allocationResult.filter((s) => !s.cod).length
        : students.filter((s) => !s.cod).length;

    const handleGenerateCodes = async (allocArg, opts = {}) => {
        // apelat din „elevi noi” lacătul e deja pus; altfel îl punem aici
        if (opts.locked) return generateCodes(allocArg, opts);
        if (busyRef.current) return;
        busyRef.current = true;
        try {
            await generateCodes(allocArg, opts);
        } finally {
            busyRef.current = false;
        }
    };

    const generateCodes = async (allocArg, { ask = true, intro = "" } = {}) => {
        const base = Array.isArray(allocArg) ? allocArg : allocationResult;
        const missing = base ? base.filter((s) => !s.cod).length : 0;
        if (!base || base.length === 0 || missing === 0) return;
        if (pendingPairs > 0) {
            showMessage(
                "warning",
                `⚠️ Confirmați întâi cele ${pendingPairs} nume corectate, ca elevii respectivi să-și păstreze codul vechi.`,
                9000
            );
            return;
        }
        if (
            ask &&
            !window.confirm(
                `Se vor da coduri definitive pentru ${missing} elevi, începând cu ${CODE_PREFIX}_${String(lastCodeN + 1).padStart(2, "0")}.\n` +
                    "Odată date, codurile nu se mai schimbă. Continuați?"
            )
        ) {
            return;
        }
        setSavingCodes(true);
        try {
            // recitim codurile din baza de date: elevii codați între timp de pe alt calculator
            // (sau dintr-o pagină lăsată deschisă) își păstrează codul, nu primesc al doilea
            const codesSnap = await getDocs(collection(db, CODES_COLLECTION));
            const codeDocs = codesSnap.docs.map((d) => ({ cod: d.id, ...d.data() }));
            const scannedMax = codeDocs.reduce((m, c) => Math.max(m, c.n || 0), 0);
            const freshByKey = new Map(
                codeDocs.filter((c) => !c.retras).map((c) => [`${c.regId}|${normName(c.nume)}`, c])
            );
            const usedFresh = new Set(base.map((s) => s.cod).filter(Boolean));
            const baseFresh = base.map((s) => {
                if (s.cod) return s;
                const c = freshByKey.get(`${s.regId}|${normName(s.nume)}`);
                if (!c || usedFresh.has(c.cod)) return s;
                usedFresh.add(c.cod);
                return { ...s, cod: c.cod, salaCod: c.salaLaAtribuire || "" };
            });
            const toCode = assignNewCodes(baseFresh, rooms, 0).added.length;
            if (toCode === 0) {
                setAllocationResult(baseFresh);
                showMessage("success", `${intro ? `${intro} ` : ""}✅ Elevii aveau deja coduri (date de pe alt calculator).`, 12000);
                return;
            }
            // numerele se rezervă atomic (config/codeCounter): două calculatoare nu pot da același cod
            const lastN = await reserveCodeNumbers(toCode, scannedMax);
            const { allocation, added } = assignNewCodes(baseFresh, rooms, lastN);

            for (let i = 0; i < added.length; i += 400) {
                const batch = writeBatch(db);
                added.slice(i, i + 400).forEach((s) =>
                    batch.set(doc(db, CODES_COLLECTION, s.cod), {
                        n: s.n,
                        regId: s.regId,
                        nume: s.nume,
                        clasa: s.clasa,
                        scoala: s.scoala,
                        profesor: s.profesor,
                        salaLaAtribuire: s.sala || "",
                        createdAt: serverTimestamp(),
                    })
                );
                await batch.commit();
            }

            const codeById = new Map(allocation.map((s) => [s.id, s.cod]));
            setAllocationResult(allocation);
            setStudents((prev) => prev.map((s) => (codeById.get(s.id) ? { ...s, cod: codeById.get(s.id) } : s)));
            setLastCodeN(lastN + added.length);
            try {
                const batches = await saveLastNewCodes(added.map((s) => s.cod));
                setSaved((prev) => (prev ? { ...prev, ...batches } : prev));
            } catch (err) {
                console.error("Eroare la salvarea listei de coduri noi:", err);
            }
            showMessage(
                "success",
                `${intro ? `${intro} ` : ""}🔐 ${added.length} coduri noi: ${added
                    .map((s) => `${s.cod} – ${s.nume} (${s.sala})`)
                    .join(", ")}. Descărcați biletele și borderoul din nou.`,
                20000
            );
        } catch (err) {
            console.error("Eroare la salvarea codurilor:", err);
            showMessage(
                "error",
                `${intro ? `${intro} ` : ""}❌ Codurile nu au putut fi salvate. Apăsați „Dă coduri elevilor noi”.`
            );
        } finally {
            setSavingCodes(false);
        }
    };

    const handleCodesPdf = (roomName) => {
        const groups = groupByRoom(allocationResult, rooms)
            .filter((g) => !roomName || g.room.name === roomName)
            .map((g) => ({ ...g, students: g.students.filter((s) => s.cod) }))
            .filter((g) => g.students.length > 0);
        printCodesPdf(
            groups,
            header,
            roomName ? `Coduri_${roomName.replace(/\s+/g, "_")}` : "Coduri_anonimizare"
        );
    };

    // tranșele de coduri (prima anonimizare + fiecare grup de elevi noi), cea mai nouă prima
    const listedCodes = new Set((saved?.codeBatches || []).flatMap((b) => b.codes || []));
    const codeBatches = (saved?.codeBatches || [])
        .map((b, i) => {
            const set = new Set(b.codes || []);
            const studentsIn = (allocationResult || []).filter(
                (s) => s.cod && (b.codes ? set.has(s.cod) : !listedCodes.has(s.cod))
            );
            return { ...b, nr: i + 1, studentsIn };
        })
        .filter((b) => b.studentsIn.length > 0)
        .reverse();
    const batchRange = (b) => {
        const codes = b.studentsIn.map((s) => s.cod).sort((x, y) => x.localeCompare(y, "ro", { numeric: true }));
        return codes.length === 1 ? codes[0] : `${codes[0]} … ${codes[codes.length - 1]}`;
    };
    const handleBatchPdf = async (b) => {
        const codes = b.studentsIn.map((s) => s.cod).sort((x, y) => x.localeCompare(y, "ro", { numeric: true }));
        printCodesPdf(
            groupByRoom(b.studentsIn, rooms),
            header,
            `Coduri_transa_${b.nr}_${codes[0]}-${codes[codes.length - 1]}`
        );
        try {
            const updated = await markBatchPrinted(b.at);
            setSaved((prev) => (prev ? { ...prev, codeBatches: updated } : prev));
        } catch (err) {
            console.error("Eroare la notarea tranșei ca tipărită:", err);
        }
    };

    // elevii cu numele corectat după ce li s-a dat codul: același cod, bilețel nou cu numele corect
    const renamedWithCode = (allocationResult || [])
        .filter(
            (s) =>
                s.cod &&
                s.numeAnterior &&
                s.numeAnterior.trim().toLocaleLowerCase("ro") !== s.nume.trim().toLocaleLowerCase("ro")
        )
        .sort((a, b) => a.cod.localeCompare(b.cod, "ro", { numeric: true }));
    const handleRenamedSlips = (list) => {
        printCodesPdf(
            groupByRoom(list, rooms),
            header,
            list.length === 1 ? `Bilet_corectat_${list[0].cod}` : "Bilete_nume_corectate"
        );
    };

    // ====== NUME CORECTATE / ELEVI SCOȘI DUPĂ REPARTIZARE ======
    const ghostId = (g) => `${g.regId}|${g.nume}`;
    const suggested = new Map((diff?.pairs || []).map((p) => [ghostId(p.ghost), p.student.id]));
    const choiceOf = (g) => reconcileChoice[ghostId(g)] ?? suggested.get(ghostId(g)) ?? "";

    const handleReconcile = async () => {
        if (!diff) return;
        const renames = [];
        const removals = [];
        const usedStudents = new Set();
        for (const g of diff.ghosts) {
            const choice = choiceOf(g);
            if (choice === "__removed") {
                removals.push({ regId: g.regId, nume: g.nume });
            } else if (choice) {
                const st = students.find((x) => x.id === choice);
                if (!st) continue;
                if (usedStudents.has(st.id)) {
                    showMessage("error", `❌ „${st.nume}” este ales pentru două nume vechi. Alegeți o singură dată.`, 8000);
                    return;
                }
                usedStudents.add(st.id);
                renames.push({ regId: g.regId, oldName: g.nume, newName: st.nume });
            }
        }
        if (renames.length === 0 && removals.length === 0) {
            showMessage("warning", "Nu ați ales nimic de confirmat.");
            return;
        }
        const lines = [
            ...renames.map((r) => `• „${r.oldName}” → „${r.newName}” (își păstrează sala și codul)`),
            ...removals.map((r) => `• „${r.nume}” — scos: se eliberează locul, codul devine retras`),
        ];
        if (!window.confirm(`Confirmați?\n\n${lines.join("\n")}`)) return;
        setReconciling(true);
        try {
            const r1 = await applyRenames(renames);
            const r2 = await applyRemovals(removals);
            await loadData();
            showMessage(
                "success",
                `✅ Gata: ${renames.length} nume corectate (săli păstrate: ${r1.seats}, coduri păstrate: ${r1.codes})` +
                    (removals.length ? `, ${removals.length} elevi scoși (locuri eliberate: ${r2.seats}).` : "."),
                10000
            );
        } catch (err) {
            console.error("Eroare la reconciliere:", err);
            showMessage("error", "❌ Modificările nu au putut fi salvate. Încercați din nou.");
        } finally {
            setReconciling(false);
        }
    };

    // ====== ANULARE ANONIMIZARE (doar dacă nu există note pe coduri) ======
    const handleCancelCodes = async () => {
        if (
            !window.confirm(
                "Anulați anonimizarea?\n\n" +
                    "• Se șterg TOATE codurile de anonimizare.\n" +
                    "• Biletele și borderoul de coduri printate până acum NU mai sunt valabile.\n" +
                    "• Repartizarea în săli rămâne neschimbată.\n" +
                    "• Nu se poate dacă au fost deja trecute note pe coduri.\n\n" +
                    "După anulare puteți genera din nou codurile."
            )
        ) {
            return;
        }
        const typed = window.prompt("Pentru confirmare scrieți cuvântul ANULEZ:");
        if ((typed || "").trim().toUpperCase() !== "ANULEZ") {
            showMessage("warning", "Anularea a fost oprită (cuvântul de confirmare nu a fost scris).");
            return;
        }
        setSavingCodes(true);
        try {
            const r = await cancelAnonymization();
            if (r.blocked) {
                showMessage(
                    "error",
                    `⛔ Anonimizarea nu se poate anula: ${r.blocked} elevi au deja note trecute pe coduri. Notele s-ar pierde.`,
                    12000
                );
                return;
            }
            try {
                await clearLastNewCodes();
                setSaved(
                    await logAllocationEvent({
                        type: "anulare-coduri",
                        roomSummaries,
                        rooms,
                        details: { deleted: r.deleted },
                    })
                );
            } catch (err) {
                console.error("Eroare la scrierea în jurnal:", err);
            }
            await loadData();
            showMessage(
                "success",
                `✅ Anonimizarea a fost anulată: ${r.deleted} coduri șterse. Repartizarea a rămas. Puteți genera din nou codurile.`,
                12000
            );
        } catch (err) {
            console.error("Eroare la anularea anonimizării:", err);
            showMessage("error", "❌ Anonimizarea nu a putut fi anulată. Încercați din nou.");
        } finally {
            setSavingCodes(false);
        }
    };

    // ====== RENDER ======
    if (loading) {
        return <div className={styles.loading}>Se încarcă datele...</div>;
    }

    const totalSeats = rooms.reduce(
        (sum, room) => sum + parseInt(room.seats || 0),
        0
    );
    const occupiedPercentage =
        totalSeats > 0
            ? Math.round((studentStats.total / totalSeats) * 100)
            : 0;

    const SECTION_TITLES = {
        repartizare: "🪑 Repartizare",
        coduri: "🔐 Coduri",
        tiparire: "🖨️ Tipărire",
    };
    const goTo = (id) => onGo && onGo(id);

    // ce mai e de tipărit: tranșele de bilețele nedescărcate și sălile elevilor din ele
    const pendingBatches = codeBatches.filter((b) => !b.printedAt);
    const pendingRooms = [
        ...new Set(pendingBatches.flatMap((b) => b.studentsIn.map((s) => s.sala)).filter(Boolean)),
    ];
    const todoBanner = (withLink) =>
        pendingBatches.length > 0 && (
            <div className={styles.todoBanner}>
                <div>
                    <b>⏳ De tipărit:</b> bilețelele pentru{" "}
                    {pendingBatches.map((b) => `tranșa ${b.nr} (${batchRange(b)})`).join(", ")}
                    {pendingRooms.length > 0 && (
                        <>
                            {" "}· lista de pe ușa: <b>{pendingRooms.join(", ")}</b>
                        </>
                    )}{" "}
                    · borderoul de coduri.
                </div>
                {withLink && onGo && (
                    <button className={styles.todoButton} onClick={() => goTo("tiparire")}>
                        🖨️ Mergi la Tipărire →
                    </button>
                )}
            </div>
        );
    const needAllocation = (
        <div className={styles.stageEmpty}>
            <p>Elevii nu sunt încă repartizați în săli.</p>
            {onGo && (
                <button className={styles.todoButton} onClick={() => goTo("repartizare")}>
                    🪑 Mergi la Repartizare →
                </button>
            )}
        </div>
    );

    // retipărirea bilețelului oricărui elev, căutat după nume sau cod
    const plainName = (t) =>
        String(t || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
    const slipWords = plainName(slipSearch).split(" ").filter(Boolean);
    const slipHits =
        slipWords.length === 0
            ? []
            : (allocationResult || [])
                  .filter((s) => s.cod && slipWords.every((w) => plainName(`${s.nume} ${s.cod}`).includes(w)))
                  .slice(0, 12);
    const slipCard = hasCodes && (
        <div className={styles.batchCard}>
            <h3>🎟️ Retipărește bilețelul unui elev</h3>
            <p className={styles.reconcileIntro}>
                Scrieți numele sau codul. Bilețelul se tipărește cu numele actual (și după o corectare de nume), cu
                același cod.
            </p>
            <input
                type="search"
                value={slipSearch}
                onChange={(e) => setSlipSearch(e.target.value)}
                placeholder="ex: bogos sofia · MMVS_105"
                className={styles.slipSearch}
            />
            {slipWords.length > 0 && slipHits.length === 0 && (
                <p className={styles.reconcileIntro}>Niciun elev cu cod pentru „{slipSearch}”.</p>
            )}
            {slipHits.length > 0 && (
                <ul className={styles.batchList}>
                    {slipHits.map((s) => (
                        <li key={s.cod} className={styles.batchPending}>
                            <div className={styles.batchInfo}>
                                <span className={styles.reconcileCode}>{s.cod}</span> <b>{s.nume}</b>
                                <div className={styles.batchWhen}>
                                    clasa {s.clasa} · {s.sala || "fără sală"} · {s.scoala}
                                    {s.numeAnterior && s.numeAnterior !== s.nume ? ` · era „${s.numeAnterior}”` : ""}
                                </div>
                            </div>
                            <button onClick={() => handleRenamedSlips([s])} className={styles.batchButton}>
                                ✂️ Bilețel
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );

    // ====== ÎNLOCUIRI (pentru procesul-verbal) ======
    const codeOf = new Map((allocationResult || []).map((s) => [s.id, s.cod]));
    const walkInRows = walkInLog
        .filter((w) => codeOf.has(w.id))
        .map((w) => ({ ...w, cod: codeOf.get(w.id) || "" }));
    const fmtTime = (iso) => {
        try {
            return new Date(iso).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
        } catch {
            return "";
        }
    };
    const handlePrintWalkIns = () => {
        const edition = editionLine(header);
        const rowsHtml = walkInRows
            .map(
                (w, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(w.sala)}</td><td><b>${escapeHtml(w.cod)}</b></td><td class="l">${escapeHtml(
                    w.nume
                )}</td><td>${escapeHtml(w.clasa)}</td><td class="l">${escapeHtml(w.scoala || "")}</td><td>${
                    w.inLocul ? `<b>${escapeHtml(w.inLocul.cod)}</b> ${escapeHtml(w.inLocul.nume)}` : "loc liber"
                }</td><td>${escapeHtml(fmtTime(w.at))}</td></tr>`
            )
            .join("");
        openPrintWindow(
            `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Elevi veniți pe loc</title><style>
@page { size: A4 landscape; margin: 12mm; }
body { font-family: Calibri, Arial, sans-serif; }
h1 { font-size: 15pt; text-align: center; margin: 0; } h2 { font-size: 12pt; text-align: center; margin: 4px 0 14px; font-weight: normal; }
table { width: 100%; border-collapse: collapse; font-size: 11pt; }
th, td { border: 1px solid #000; padding: 5px 6px; text-align: center; } th { background: #e5e7eb; } td.l { text-align: left; }
.sign { margin-top: 40px; display: flex; justify-content: space-between; font-size: 11pt; }
</style></head><body>
<h1>${escapeHtml(CONTEST_TITLE)}</h1>
<h2>${escapeHtml(edition)} — Elevi veniți pe loc, așezați în locul elevilor absenți</h2>
<table><thead><tr><th>Nr.</th><th>Sala</th><th>Cod nou</th><th>Elev venit pe loc</th><th>Clasa</th><th>Școala</th><th>În locul elevului absent</th><th>Ora</th></tr></thead>
<tbody>${rowsHtml}</tbody></table>
<div class="sign"><span>Președinte comisie: ____________________</span><span>Secretar: ____________________</span></div>
</body></html>`,
            "Elevi_veniti_pe_loc"
        );
    };
    const walkInLogCard = walkInRows.length > 0 && (
        <div className={styles.walkInCard}>
            <h3>📋 Elevi veniți pe loc ({walkInRows.length}) — pentru procesul-verbal</h3>
            <div className={styles.resultsTableWrapper}>
                <table className={styles.reconcileTable}>
                    <thead>
                        <tr>
                            <th>Sala</th>
                            <th>Elev venit pe loc</th>
                            <th>În locul elevului absent</th>
                            <th>Ora</th>
                        </tr>
                    </thead>
                    <tbody>
                        {walkInRows.map((w) => (
                            <tr key={w.id + w.at}>
                                <td>{w.sala}</td>
                                <td>
                                    <span className={styles.reconcileCode}>{w.cod || "fără cod"}</span> <b>{w.nume}</b> ·{" "}
                                    {w.clasa}
                                </td>
                                <td>
                                    {w.inLocul ? (
                                        <>
                                            <span className={styles.reconcileCode}>{w.inLocul.cod}</span> {w.inLocul.nume}
                                        </>
                                    ) : (
                                        "loc liber"
                                    )}
                                </td>
                                <td>{fmtTime(w.at)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <button className={styles.batchButton} onClick={handlePrintWalkIns} style={{ marginTop: 10 }}>
                🖨️ Tipărește lista (proces-verbal)
            </button>
        </div>
    );

    // cardul cu bilețelele de retipărit (apare la Coduri și la Tipărire)
    const renamedCard = hasCodes && renamedWithCode.length > 0 && (
                            <div className={styles.batchCard}>
                                <h3>✏️ Nume corectate după anonimizare ({renamedWithCode.length})</h3>
                                <p className={styles.reconcileIntro}>
                                    Elevul își păstrează <b>același cod</b>, aceeași sală și notele; doar numele de pe
                                    bilețel se schimbă. Tipăriți bilețelul nou și înlocuiți-l pe cel vechi.
                                </p>
                                <ul className={styles.batchList}>
                                    {renamedWithCode.map((s) => (
                                        <li key={s.cod} className={styles.batchPending}>
                                            <div className={styles.batchInfo}>
                                                <span className={styles.reconcileCode}>{s.cod}</span>{" "}
                                                <s>{s.numeAnterior}</s> → <b>{s.nume}</b>
                                                <div className={styles.batchWhen}>
                                                    clasa {s.clasa} · {s.sala || "fără sală"} · {s.scoala}
                                                </div>
                                            </div>
                                            <button onClick={() => handleRenamedSlips([s])} className={styles.batchButton}>
                                                ✂️ Bilețel nou
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                                {renamedWithCode.length > 1 && (
                                    <button
                                        onClick={() => handleRenamedSlips(renamedWithCode)}
                                        className={styles.batchButton}
                                        style={{ marginTop: 10 }}
                                    >
                                        ✂️ Toate bilețelele corectate ({renamedWithCode.length})
                                    </button>
                                )}
                            </div>
    );

    return (
        <div className={styles.container}>
            {stageBar}
            <h1 className={styles.title}>{SECTION_TITLES[section] || "🪑 Repartizare"}</h1>

            {message && (
                <div
                    className={
                        message.type === "success"
                            ? styles.successMessage
                            : message.type === "warning"
                            ? styles.warningMessage
                            : styles.errorMessage
                    }
                >
                    {message.text}
                </div>
            )}

            {!stageBar && (
                <div className={styles.buttonContainer}>
                    {onDashboard && (
                        <button onClick={onDashboard} className={styles.backButton}>
                            ← Panou Admin
                        </button>
                    )}
                    {onBack && (
                        <button onClick={onBack} className={styles.backButton}>
                            ← Înapoi la Săli
                        </button>
                    )}
                </div>
            )}

            {/* ===================== REPARTIZARE ===================== */}
            {section === "repartizare" && (
                <>
                        <div className={styles.infoBoxesContainer}>
                            <div className={styles.infoBox}>
                                <h3>👥 Elevi Înscriși</h3>
                                {CLASS_ORDER.map((clasa) => (
                                    <div key={clasa} className={styles.infoRow}>
                                        <span className={styles.infoLabel}>
                                            Clasa {clasa}:
                                        </span>
                                        <span className={styles.infoValue}>
                                            {studentStats[clasa] || 0}
                                        </span>
                                    </div>
                                ))}
                                <div className={styles.infoRowTotal}>
                                    <span className={styles.infoLabel}>TOTAL ELEVI:</span>
                                    <span className={styles.infoValue}>
                                        {studentStats.total}
                                    </span>
                                </div>
                            </div>

                            <div className={styles.infoBox}>
                                <h3>🏫 Capacitate Săli</h3>
                                <div className={styles.infoRow}>
                                    <span className={styles.infoLabel}>Săli active:</span>
                                    <span className={styles.infoValue}>
                                        {rooms.length}
                                    </span>
                                </div>
                                <div className={styles.infoRow}>
                                    <span className={styles.infoLabel}>Locuri totale:</span>
                                    <span className={styles.infoValue}>{totalSeats}</span>
                                </div>
                                <div className={styles.infoRowTotal}>
                                    <span className={styles.infoLabel}>GRAD OCUPARE:</span>
                                    <span
                                        className={styles.infoValue}
                                        style={{
                                            color:
                                                studentStats.total > totalSeats
                                                    ? "red"
                                                    : "green",
                                        }}
                                    >
                                        {occupiedPercentage}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        <AllocationLogCard
                            saved={saved}
                            newCount={newStudents}
                            renamedCount={pendingPairs}
                            ghostCount={diff ? diff.unpairedGhosts.length : 0}
                            onPlaceNew={absentIds.size === 0 ? handleKeepAllocation : undefined}
                            onRegenerate={handleGenerateAllocation}
                        />

                    {allocationResult && walkIns.length > 0 && (
                        <div className={styles.walkInCard}>
                            <h3>🪑 Elevi noi — alegeți sala (locurile absenților sunt disponibile)</h3>
                            <p className={styles.reconcileIntro}>
                                Absenții se bifează la <b>Notare</b>. Locul unui absent devine disponibil; elevul nou
                                primește <b>cod nou</b> (absentul își păstrează codul lui). ★ = în sală lipsește un elev
                                din aceeași clasă.{" "}
                                <button type="button" className={styles.linkButton} onClick={loadAbsents}>
                                    🔄 Actualizează absenții
                                </button>
                            </p>
                            {walkIns.map((st) => {
                                const options = roomsFor(st);
                                return (
                                    <div key={st.id} className={styles.walkInRow}>
                                        <div className={styles.walkInName}>
                                            <b>{st.nume}</b> · clasa {st.clasa}
                                            <div className={styles.batchWhen}>{st.scoala}</div>
                                        </div>
                                        {options.length === 0 ? (
                                            <span className={styles.batchTodo}>
                                                Niciun loc disponibil — bifați absenții la Notare sau folosiți butonul de mai jos.
                                            </span>
                                        ) : (
                                            <>
                                                <select
                                                    className={styles.reconcileSelect}
                                                    value={
                                                        options.some((r) => r.room.name === placeChoice[st.id])
                                                            ? placeChoice[st.id]
                                                            : options[0].room.name
                                                    }
                                                    onChange={(e) =>
                                                        setPlaceChoice((prev) => ({ ...prev, [st.id]: e.target.value }))
                                                    }
                                                >
                                                    {options.map((r) => (
                                                        <option key={r.room.name} value={r.room.name}>
                                                            {roomLabel(r, st)}
                                                        </option>
                                                    ))}
                                                </select>
                                                <button
                                                    className={styles.batchButton}
                                                    onClick={() => handlePlaceOne(st)}
                                                    disabled={placingNew || savingCodes}
                                                >
                                                    🪑 Așază aici
                                                </button>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {walkInLogCard}

                    <div className={styles.actionButtonsContainer}>
                        {/* după prima repartizare, refacerea totală devine un buton discret (mută elevii în alte săli) */}
                        <button
                            onClick={handleGenerateAllocation}
                            className={allocationResult ? styles.dangerButton : styles.generateButton}
                            disabled={
                                students.length === 0 || rooms.length === 0 || loading
                            }
                            title={
                                allocationResult
                                    ? "Reface TOATĂ repartizarea: elevii pot ajunge în alte săli decât cele de pe listele printate"
                                    : undefined
                            }
                        >
                            {allocationResult
                                ? "🎲 Refă toată repartizarea de la zero"
                                : "🎲 Generează Repartizare Inteligentă"}
                        </button>

                        {(studentsWithCode > 0 || saved?.last) && newStudents > 0 && absentIds.size === 0 && (
                            <button
                                onClick={handleKeepAllocation}
                                className={styles.newStudentsButton}
                                disabled={rooms.length === 0 || loading || placingNew || savingCodes}
                                title="Elevii care au cod rămân în sala lor; cei fără cod se pun pe locurile libere, începând cu ultima sală"
                            >
                                {`➕ Repartizează elevii noi (${newStudents}) în ultima sală`}
                            </button>
                        )}
                    </div>

                        {diff && diff.ghosts.length > 0 && (
                            <div className={styles.reconcileCard}>
                                <h3>🔗 Nume corectate sau elevi scoși după repartizare</h3>
                                <p className={styles.reconcileIntro}>
                                    Acești elevi apar în repartizare (sau au cod), dar nu mai există cu acest nume în
                                    înscrieri. De obicei numele a fost corectat. Alegeți elevul corespunzător: își
                                    păstrează <b>sala</b> și <b>codul</b>. Dacă elevul a fost scos, alegeți „scos”:
                                    locul se eliberează, iar codul nu se mai dă nimănui.
                                </p>
                                <table className={styles.reconcileTable}>
                                    <thead>
                                        <tr>
                                            <th>Nume vechi (din repartizare)</th>
                                            <th>Sală / cod</th>
                                            <th>Este acum…</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {diff.ghosts.map((g) => {
                                            const options = diff.newcomers.filter((st) => st.regId === g.regId);
                                            const choice = choiceOf(g);
                                            return (
                                                <tr key={ghostId(g)}>
                                                    <td>
                                                        <b>{g.nume}</b>
                                                    </td>
                                                    <td>
                                                        {g.sala || "—"}
                                                        {g.cod && <span className={styles.reconcileCode}>{g.cod}</span>}
                                                    </td>
                                                    <td>
                                                        <select
                                                            value={choice}
                                                            onChange={(e) =>
                                                                setReconcileChoice((prev) => ({
                                                                    ...prev,
                                                                    [ghostId(g)]: e.target.value,
                                                                }))
                                                            }
                                                            className={styles.reconcileSelect}
                                                        >
                                                            <option value="">— nu decid acum —</option>
                                                            {options.map((st) => (
                                                                <option key={st.id} value={st.id}>
                                                                    ✏️ {st.nume} ({st.clasa})
                                                                    {suggested.get(ghostId(g)) === st.id ? " — sugerat" : ""}
                                                                </option>
                                                            ))}
                                                            <option value="__removed">🚪 Elevul a fost scos din concurs</option>
                                                        </select>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                <button
                                    onClick={handleReconcile}
                                    className={styles.reconcileButton}
                                    disabled={reconciling}
                                >
                                    {reconciling ? "Se salvează..." : "✅ Confirmă"}
                                </button>
                            </div>
                        )}

                    {todoBanner(true)}

                        {allocationResult && roomSummaries.length > 0 && (
                            <div className={styles.previewContainer}>
                                <h2 className={styles.subtitle}>🏫 Fiecare sală în parte</h2>
                                <AllocationStatsView stats={allocationStats(roomSummaries, rooms)} />
                                <div className={styles.resultsTableWrapper}>
                                    <table className={styles.resultsTable}>
                                        <thead>
                                            <tr>
                                                <th>Sală</th>
                                                <th>Ocupare</th>
                                                <th>Clase</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {roomSummaries.map((s) => (
                                                <tr key={s.room.id || s.room.name}>
                                                    <td style={{ fontWeight: "bold" }}>
                                                        {s.room.name}
                                                        {s.room.floor ? ` (${s.room.floor})` : ""}
                                                    </td>
                                                    <td>
                                                        {s.count} / {s.seats}
                                                    </td>
                                                    <td>
                                                        {CLASS_ORDER.filter((c) => s.perClass[c]).map((c) => (
                                                            <span
                                                                key={c}
                                                                className={styles.classChip}
                                                                style={{ background: `#${CLASS_COLORS[c]}` }}
                                                            >
                                                                {s.perClass[c]} × {c}
                                                            </span>
                                                        ))}
                                                        {s.mosaic && (
                                                            <span className={styles.classChip}>🧩 mozaic</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {allocationResult && (
                            <div className={styles.previewContainer}>
                                <h2 className={styles.subtitle}>
                                    📋 Rezultat Repartizare ({allocationResult.length} elevi)
                                </h2>

                                <div className={styles.resultsTableWrapper}>
                                    <table className={styles.resultsTable}>
                                        <thead>
                                            <tr>
                                                <th>Nr.</th>
                                                <th>Nume Elev</th>
                                                <th>Clasa</th>
                                                <th>Școala</th>
                                                <th>Profesor</th>
                                                <th>Sală</th>
                                                {hasCodes && <th>Cod</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {allocationResult.map((item, index) => (
                                                <tr key={index}>
                                                    <td>{index + 1}</td>
                                                    <td>{item.nume}</td>
                                                    <td>{item.clasa}</td>
                                                    <td>{item.scoala}</td>
                                                    <td>{item.profesor}</td>
                                                    <td
                                                        style={{
                                                            fontWeight: "bold",
                                                            color: "#2980b9",
                                                        }}
                                                    >
                                                        {item.sala}
                                                    </td>
                                                    {hasCodes && (
                                                        <td style={{ fontWeight: "bold", fontFamily: "monospace" }}>
                                                            {item.cod}
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                </>
            )}

            {/* ===================== CODURI ===================== */}
            {section === "coduri" &&
                (!allocationResult ? (
                    needAllocation
                ) : (
                    <>
                        <div className={styles.codesSummary}>
                            <div>
                                <b>{studentsWithCode}</b> elevi au cod
                                {lastCodeN > 0 && (
                                    <>
                                        {" "}· ultimul cod dat:{" "}
                                        <b>
                                            {CODE_PREFIX}_{String(lastCodeN).padStart(2, "0")}
                                        </b>
                                    </>
                                )}
                                {withoutCode > 0 && (
                                    <>
                                        {" "}· <span className={styles.batchTodo}>{withoutCode} fără cod</span>
                                    </>
                                )}
                            </div>
                            <div className={styles.codesHint}>
                                Codurile se dau în ordinea sălilor și nu se mai schimbă. Elevii noi primesc cod
                                automat când sunt repartizați.
                            </div>
                        </div>

                        <div className={styles.actionButtonsContainer}>
                                {allocationResult && (
                                    <button
                                        onClick={handleGenerateCodes}
                                        className={styles.codesButton}
                                        disabled={withoutCode === 0 || savingCodes}
                                        title="Elevii fără cod primesc coduri definitive, în ordinea sălilor; cei care au deja cod îl păstrează"
                                    >
                                        🔐{" "}
                                        {savingCodes
                                            ? "Se salvează codurile..."
                                            : withoutCode === 0
                                            ? "Toți elevii au cod"
                                            : hasCodes
                                            ? `Dă coduri elevilor noi (${withoutCode})`
                                            : "Generează coduri anonimizare"}
                                    </button>
                                )}
                            {hasCodes && (
                                <>
                                    <button
                                        onClick={handleCancelCodes}
                                        className={styles.dangerButton}
                                        disabled={savingCodes}
                                        title="Șterge toate codurile (doar dacă nu s-au trecut note pe coduri); repartizarea rămâne"
                                    >
                                        🗑️ Anulează anonimizarea
                                    </button>
                                </>
                            )}
                        </div>

                    <>
                        {diff && diff.ghosts.length > 0 && (
                            <div className={styles.reconcileCard}>
                                <h3>🔗 Nume corectate sau elevi scoși după repartizare</h3>
                                <p className={styles.reconcileIntro}>
                                    Acești elevi apar în repartizare (sau au cod), dar nu mai există cu acest nume în
                                    înscrieri. De obicei numele a fost corectat. Alegeți elevul corespunzător: își
                                    păstrează <b>sala</b> și <b>codul</b>. Dacă elevul a fost scos, alegeți „scos”:
                                    locul se eliberează, iar codul nu se mai dă nimănui.
                                </p>
                                <table className={styles.reconcileTable}>
                                    <thead>
                                        <tr>
                                            <th>Nume vechi (din repartizare)</th>
                                            <th>Sală / cod</th>
                                            <th>Este acum…</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {diff.ghosts.map((g) => {
                                            const options = diff.newcomers.filter((st) => st.regId === g.regId);
                                            const choice = choiceOf(g);
                                            return (
                                                <tr key={ghostId(g)}>
                                                    <td>
                                                        <b>{g.nume}</b>
                                                    </td>
                                                    <td>
                                                        {g.sala || "—"}
                                                        {g.cod && <span className={styles.reconcileCode}>{g.cod}</span>}
                                                    </td>
                                                    <td>
                                                        <select
                                                            value={choice}
                                                            onChange={(e) =>
                                                                setReconcileChoice((prev) => ({
                                                                    ...prev,
                                                                    [ghostId(g)]: e.target.value,
                                                                }))
                                                            }
                                                            className={styles.reconcileSelect}
                                                        >
                                                            <option value="">— nu decid acum —</option>
                                                            {options.map((st) => (
                                                                <option key={st.id} value={st.id}>
                                                                    ✏️ {st.nume} ({st.clasa})
                                                                    {suggested.get(ghostId(g)) === st.id ? " — sugerat" : ""}
                                                                </option>
                                                            ))}
                                                            <option value="__removed">🚪 Elevul a fost scos din concurs</option>
                                                        </select>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                <button
                                    onClick={handleReconcile}
                                    className={styles.reconcileButton}
                                    disabled={reconciling}
                                >
                                    {reconciling ? "Se salvează..." : "✅ Confirmă"}
                                </button>
                            </div>
                        )}

                        {retiredCodes.length > 0 && (
                            <p className={styles.retiredNote}>
                                🗄️ Coduri retrase (elevi scoși), care nu se mai dau nimănui:{" "}
                                {retiredCodes.map((c) => `${c.cod} (${c.nume})`).join(", ")}.
                            </p>
                        )}

                        {renamedCard}
                        {slipCard}
                    </>

                        {todoBanner(true)}
                    </>
                ))}

            {/* ===================== TIPĂRIRE ===================== */}
            {section === "tiparire" &&
                (!allocationResult ? (
                    needAllocation
                ) : (
                    <>
                        {todoBanner(false)}

                        {/* 1. Antetul */}
                        <section className={styles.printSection}>
                            <div className={styles.printSectionHead}>
                                <span className={styles.printStep}>1</span>
                                <div>
                                    <h3>Antetul documentelor</h3>
                                    <p>Apare pe toate listele, bilețelele, borderourile și rapoartele</p>
                                </div>
                            </div>
                            <div className={styles.printHeaderRow}>
                                <label>
                                    Ediția
                                    <input
                                        type="text"
                                        value={header.edition}
                                        onChange={(e) => updateHeader("edition", e.target.value)}
                                        placeholder="ex: a XX-a"
                                    />
                                </label>
                                <label>
                                    Data concursului
                                    <input
                                        type="text"
                                        value={header.date}
                                        onChange={(e) => updateHeader("date", e.target.value)}
                                        placeholder="ex: 21 noiembrie 2026"
                                    />
                                </label>
                                <div className={styles.printHeaderPreview}>
                                    <small>Pe documente apare</small>
                                    <b>
                                        Ediția {header.edition} - {header.date}
                                    </b>
                                </div>
                            </div>
                        </section>

                        {/* 2. Liste și coduri */}
                        <section className={styles.printSection}>
                            <div className={styles.printSectionHead}>
                                <span className={styles.printStep}>2</span>
                                <div>
                                    <h3>Liste pe săli și coduri</h3>
                                    <p>Pentru uși, pentru elevi și pentru comisie — toate sălile odată</p>
                                </div>
                            </div>
                            <div className={styles.printGrid}>
                                <div className={styles.printCard} style={{ "--c": "#1f3864", "--t": "#e0e7ff" }}>
                                    <div className={styles.printCardHead}>
                                        <span className={styles.printCardIcon}>🚪</span>
                                        <div>
                                            <b>Liste pentru uși</b>
                                            <small>
                                                {allocationResult.length} elevi · câte o pagină pe sală · absenții marcați
                                            </small>
                                        </div>
                                    </div>
                                    <div className={styles.printBtns}>
                                        <button onClick={() => handleExportPdf()}>📄 PDF</button>
                                        <button onClick={() => handleExportExcel()}>📥 Excel</button>
                                    </div>
                                </div>
                                {hasCodes && (
                                    <div className={styles.printCard} style={{ "--c": "#6c3483", "--t": "#f3e8ff" }}>
                                        <div className={styles.printCardHead}>
                                            <span className={styles.printCardIcon}>✂️</span>
                                            <div>
                                                <b>Bilețele cu coduri</b>
                                                <small>De decupat și dat elevilor · plus borderoul tuturor codurilor</small>
                                            </div>
                                        </div>
                                        <div className={styles.printBtns}>
                                            <button onClick={() => handleCodesPdf()}>✂️ Bilețele PDF</button>
                                            <button onClick={() => exportCodesExcel(allocationResult, rooms, header)}>
                                                📥 Borderou coduri
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {hasCodes && (
                                    <div className={styles.printCard} style={{ "--c": "#b45309", "--t": "#fef3c7" }}>
                                        <div className={styles.printCardHead}>
                                            <span className={styles.printCardIcon}>🔐</span>
                                            <div>
                                                <b>Liste pe săli cu coduri</b>
                                                <small>Pentru comisie · coloana „Cod” evidențiată</small>
                                            </div>
                                        </div>
                                        <div className={styles.printOption}>
                                            <span>
                                                <b>Toți elevii</b> · {allocationResult.length}, fără marcaje
                                            </span>
                                            <div className={styles.printBtns}>
                                                <button onClick={() => handleCodeList("toti", "pdf")}>📄 PDF</button>
                                                <button onClick={() => handleCodeList("toti", "excel")}>📥 Excel</button>
                                            </div>
                                        </div>
                                        <div className={styles.printOption}>
                                            <span>
                                                <b>Fără absenți</b> · {allocationResult.filter((st) => !isAbsent(st)).length}{" "}
                                                prezenți
                                                {absentIds.size > 0
                                                    ? `, ${allocationResult.filter(isAbsent).length} absenți scoși`
                                                    : ", niciun absent bifat"}
                                            </span>
                                            <div className={styles.printBtns}>
                                                <button onClick={() => handleCodeList("prezenti", "pdf")}>📄 PDF</button>
                                                <button onClick={() => handleCodeList("prezenti", "excel")}>📥 Excel</button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* 3. Ziua concursului și după */}
                        <section className={styles.printSection}>
                            <div className={styles.printSectionHead}>
                                <span className={styles.printStep}>3</span>
                                <div>
                                    <h3>Ziua concursului și după</h3>
                                    <p>Prezență, corectare și situațiile de trimis</p>
                                </div>
                            </div>
                            <div className={styles.launchGrid}>
                                <button
                                    className={`${styles.launchTile} ${styles.launchGreen}`}
                                    onClick={() => setShowAttendance(true)}
                                >
                                    <span className={styles.launchIcon}>📊</span>
                                    <b>Prezența la concurs</b>
                                    <small>Înscriși, prezenți, absenți — total și pe clase · raport PDF</small>
                                    <span className={styles.launchArrow}>Deschide →</span>
                                </button>
                                <button
                                    className={`${styles.launchTile} ${styles.launchPink}`}
                                    onClick={() => setShowBorderouri(true)}
                                >
                                    <span className={styles.launchIcon}>📝</span>
                                    <b>Borderouri de corectare</b>
                                    <small>Individuale pe subiecte și finale, pe fiecare clasă</small>
                                    <span className={styles.launchArrow}>Deschide →</span>
                                </button>
                                <button
                                    className={`${styles.launchTile} ${styles.launchBlue}`}
                                    onClick={() => setShowReports(true)}
                                >
                                    <span className={styles.launchIcon}>📦</span>
                                    <b>Situații pentru raportare</b>
                                    <small>Rezultate pe clase, școli și profesori participanți</small>
                                    <span className={styles.launchArrow}>Deschide →</span>
                                </button>
                            </div>
                        </section>
                        {/* 4. Premii în bani */}
                        <section className={styles.printSection}>
                            <div className={styles.printSectionHead}>
                                <span className={styles.printStep}>4</span>
                                <div>
                                    <h3>Premii în bani</h3>
                                    <p>Tabelul nominal cu sumele și loc de semnătură · premiile se aleg pe fiecare elev la Notare</p>
                                </div>
                            </div>
                            <PrizeMoneyCard header={header} />
                        </section>
                        {showAttendance && <AttendanceView onClose={() => setShowAttendance(false)} />}
                        {showBorderouri && <BorderouriView onClose={() => setShowBorderouri(false)} />}
                        {showReports && <ReportsView onClose={() => setShowReports(false)} />}

                    <>
                        {(renamedCard || walkInLogCard || (hasCodes && codeBatches.length > 0)) && (
                            <div className={`${styles.printSection} ${styles.printSectionBare}`}>
                                <div className={styles.printSectionHead}>
                                    <span className={styles.printStep}>5</span>
                                    <div>
                                        <h3>Evidențe și corecturi</h3>
                                        <p>Nume corectate, elevi veniți pe loc, tranșele de coduri</p>
                                    </div>
                                </div>
                            </div>
                        )}
                        {renamedCard}
                        {walkInLogCard}

                        {hasCodes && codeBatches.length > 0 && (
                            <div className={styles.batchCard}>
                                <h3>✂️ Tranșe de coduri ({codeBatches.length})</h3>
                                <p className={styles.reconcileIntro}>
                                    Fiecare dată când s-au dat coduri apare aici, cea mai nouă sus. Bilețelele descărcate
                                    sunt marcate cu ✅, ca să știți ce mai aveți de tipărit.
                                </p>
                                <ul className={styles.batchList}>
                                    {codeBatches.map((b) => (
                                        <li
                                            key={b.at}
                                            className={b.printedAt ? styles.batchPrinted : styles.batchPending}
                                            title={b.studentsIn.map((s) => `${s.cod} – ${s.nume} (${s.sala})`).join("\n")}
                                        >
                                            <div className={styles.batchInfo}>
                                                <b>
                                                    Tranșa {b.nr}
                                                    {b.nr === 1 ? " (anonimizarea inițială)" : ""}
                                                </b>{" "}
                                                · {b.studentsIn.length} {b.studentsIn.length === 1 ? "elev" : "elevi"}{" "}
                                                <span className={styles.reconcileCode}>{batchRange(b)}</span>
                                                <div className={styles.batchWhen}>
                                                    {b.at !== "initial" && <>coduri date pe {formatWhen(b.at)} · </>}
                                                    {b.printedAt ? (
                                                        <span className={styles.batchOk}>
                                                            ✅{" "}
                                                            {b.printedAt === "initial"
                                                                ? "bilețele tipărite la anonimizare"
                                                                : `bilețele descărcate pe ${formatWhen(b.printedAt)}`}
                                                        </span>
                                                    ) : (
                                                        <span className={styles.batchTodo}>⏳ bilețele netipărite încă</span>
                                                    )}
                                                </div>
                                                {b.nr > 1 && b.studentsIn.length <= 20 && (
                                                    <div className={styles.batchNames}>
                                                        {b.studentsIn.map((s) => `${s.cod} ${s.nume} (${s.sala})`).join(" · ")}
                                                    </div>
                                                )}
                                            </div>
                                            <button onClick={() => handleBatchPdf(b)} className={styles.batchButton}>
                                                ✂️ Bilețele {b.printedAt ? "(din nou)" : ""}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {allocationResult && roomSummaries.length > 0 && (
                            <div className={styles.previewContainer}>
                                <h2 className={styles.subtitle}>🏫 Situația pe săli</h2>
                                <AllocationStatsView stats={allocationStats(roomSummaries, rooms)} />
                                <div className={styles.resultsTableWrapper}>
                                    <table className={styles.resultsTable}>
                                        <thead>
                                            <tr>
                                                <th>Sală</th>
                                                <th>Ocupare</th>
                                                <th>Clase</th>
                                                <th>Listă</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {roomSummaries.map((s) => (
                                                <tr key={s.room.id || s.room.name}>
                                                    <td style={{ fontWeight: "bold" }}>
                                                        {s.room.name}
                                                        {s.room.floor ? ` (${s.room.floor})` : ""}
                                                    </td>
                                                    <td>
                                                        {s.count} / {s.seats}
                                                    </td>
                                                    <td>
                                                        {CLASS_ORDER.filter((c) => s.perClass[c]).map((c) => (
                                                            <span
                                                                key={c}
                                                                className={styles.classChip}
                                                                style={{ background: `#${CLASS_COLORS[c]}` }}
                                                            >
                                                                {s.perClass[c]} × {c}
                                                            </span>
                                                        ))}
                                                        {s.mosaic && (
                                                            <span className={styles.classChip}>🧩 mozaic</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <button
                                                            onClick={() => handleExportPdf(s.room.name)}
                                                            className={styles.smallPdfButton}
                                                        >
                                                            📄 PDF
                                                        </button>{" "}
                                                        <button
                                                            onClick={() => handleExportExcel(s.room.name)}
                                                            className={styles.smallExcelButton}
                                                        >
                                                            📥 Excel
                                                        </button>
                                                        {hasCodes && (
                                                            <>
                                                                {" "}
                                                                <button
                                                                    onClick={() => handleCodesPdf(s.room.name)}
                                                                    className={styles.smallCodesButton}
                                                                >
                                                                    ✂️ Coduri
                                                                </button>
                                                            </>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                    </>
                ))}
        </div>
    );
}

export default AllocationProcess;
