import React, { useState, useEffect } from "react";
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
import { loadAllocation, saveAllocation } from "./allocationStore";
import { AllocationLogCard, AllocationStatsView } from "./AllocationLog";
import {
    exportRoomsExcel,
    groupByRoom,
    printRoomsPdf,
    assignNewCodes,
    exportCodesExcel,
    printCodesPdf,
    CODE_PREFIX,
    CLASS_COLORS,
} from "./roomLists";
import {
    CODES_COLLECTION,
    loadContestStudents,
    loadHeader,
    saveHeader,
} from "./contestData";

function AllocationProcess({ onBack, onDashboard }) {
    const [header, setHeader] = useState(loadHeader);
    const [loading, setLoading] = useState(true);
    const [students, setStudents] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [allocationResult, setAllocationResult] = useState(null);
    const [roomSummaries, setRoomSummaries] = useState([]);
    const [message, setMessage] = useState(null);
    const [lastCodeN, setLastCodeN] = useState(0);
    const [orphanCodes, setOrphanCodes] = useState([]);
    const [savingCodes, setSavingCodes] = useState(false);
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
            setStudents(data.students);
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
    const handleExportExcel = (roomName) => {
        if (!allocationResult || allocationResult.length === 0) {
            showMessage("warning", "Nu există date de repartizare pentru export!");
            return;
        }
        const groups = groupByRoom(allocationResult, rooms).filter(
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
        const groups = groupByRoom(allocationResult, rooms).filter(
            (g) => !roomName || g.room.name === roomName
        );
        printRoomsPdf(
            groups,
            header,
            roomName ? `Lista_${roomName.replace(/\s+/g, "_")}` : "Repartizare_pe_Sali"
        );
    };

    // ====== ELEVI NOI: ceilalți rămân în sala lor, noii merg în ultima sală ======
    const studentsWithCode = students.filter((s) => s.cod).length;
    // elevii care nu apar în repartizarea afișată (înscriși după ea)
    const placedIds = new Set((allocationResult || []).map((s) => s.id));
    const newStudents = allocationResult ? students.filter((s) => !placedIds.has(s.id)).length : 0;

    const handleKeepAllocation = async () => {
        if (rooms.length === 0) return;
        const result = allocateKeepingCodes(students, rooms, { saved: saved?.assignments });
        setAllocationResult(result.data);
        setRoomSummaries(result.roomSummaries);
        if (result.newcomers === 0) {
            showMessage("success", "✅ Repartizarea salvată: fiecare elev în sala lui.");
            return;
        }
        try {
            setSaved(
                await saveAllocation({
                    data: result.data,
                    roomSummaries: result.roomSummaries,
                    rooms,
                    type: "elevi-noi",
                    added: result.newcomers,
                    previous: saved,
                })
            );
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
            await handleGenerateCodes(result.data, { ask: false, intro: placedMsg });
        } else {
            showMessage(result.overflow ? "warning" : "success", placedMsg);
        }
    };

    // ====== ANONIMIZARE (coduri MMVS_01 ...) ======
    const hasCodes = !!allocationResult?.some((s) => s.cod);
    const withoutCode = allocationResult
        ? allocationResult.filter((s) => !s.cod).length
        : students.filter((s) => !s.cod).length;

    const handleGenerateCodes = async (allocArg, { ask = true, intro = "" } = {}) => {
        const base = Array.isArray(allocArg) ? allocArg : allocationResult;
        const missing = base ? base.filter((s) => !s.cod).length : 0;
        if (!base || base.length === 0 || missing === 0) return;
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
            // recitim ultimul cod din baza de date, ca să nu dăm de două ori același număr
            const codesSnap = await getDocs(collection(db, CODES_COLLECTION));
            const lastN = codesSnap.docs.reduce((m, d) => Math.max(m, d.data().n || 0), 0);
            const { allocation, added } = assignNewCodes(base, rooms, lastN);

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

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Procesul de Repartizare</h1>

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

            <div className={styles.buttonContainer}>
                {onDashboard && (
                    <button onClick={onDashboard} className={styles.backButton}>
                        ← Panou Admin
                    </button>
                )}
                <button onClick={onBack} className={styles.backButton}>
                    ← Înapoi la Configurare Săli
                </button>
            </div>

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
                onPlaceNew={handleKeepAllocation}
                onRegenerate={handleGenerateAllocation}
            />

            <div className={styles.headerSettings}>
                <h3>📝 Antetul listelor</h3>
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
                <p className={styles.headerPreview}>
                    Pe liste: <b>Ediția {header.edition} - {header.date}</b>
                </p>
            </div>

            <div className={styles.actionButtonsContainer}>
                <button
                    onClick={handleGenerateAllocation}
                    className={styles.generateButton}
                    disabled={
                        students.length === 0 || rooms.length === 0 || loading
                    }
                >
                    🎲 Generează Repartizare Inteligentă
                </button>

                {(studentsWithCode > 0 || saved?.last) && newStudents > 0 && (
                    <button
                        onClick={handleKeepAllocation}
                        className={styles.newStudentsButton}
                        disabled={rooms.length === 0 || loading}
                        title="Elevii care au cod rămân în sala lor; cei fără cod se pun pe locurile libere, începând cu ultima sală"
                    >
                        {`➕ Repartizează elevii noi (${newStudents}) în ultima sală`}
                    </button>
                )}

                {allocationResult && (
                    <button
                        onClick={handleExportExcel}
                        className={styles.exportButton}
                    >
                        📥 Descarcă Excel ({allocationResult.length} elevi)
                    </button>
                )}

                {allocationResult && (
                    <button
                        onClick={() => handleExportPdf()}
                        className={styles.pdfButton}
                    >
                        📄 Liste pentru uși (PDF)
                    </button>
                )}

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
            </div>

            {orphanCodes.length > 0 && (
                <div className={styles.warningMessage}>
                    ⚠️ {orphanCodes.length} coduri date anterior nu mai au elev corespunzător (înscriere
                    ștearsă sau elev scos):{" "}
                    {orphanCodes.map((c) => `${c.cod} (${c.nume})`).join(", ")}. Codurile acestea nu se
                    refolosesc.
                </div>
            )}

            {hasCodes && (
                <div className={styles.actionButtonsContainer}>
                    <button
                        onClick={() => handleCodesPdf()}
                        className={styles.codesButton}
                    >
                        ✂️ Bilețele cu coduri – toate sălile (PDF)
                    </button>
                    <button
                        onClick={() => exportCodesExcel(allocationResult, rooms, header)}
                        className={styles.exportButton}
                    >
                        📥 Borderou coduri (Excel)
                    </button>
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
        </div>
    );
}

export default AllocationProcess;
