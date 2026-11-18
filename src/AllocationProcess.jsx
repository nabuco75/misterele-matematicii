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
import { allocateByClassPairs, CLASS_ORDER, sortRooms } from "./allocation";
import {
    exportRoomsExcel,
    groupByRoom,
    printRoomsPdf,
    assignNewCodes,
    exportCodesExcel,
    printCodesPdf,
    CODE_PREFIX,
    CLASS_COLORS,
    DEFAULT_EDITION,
    DEFAULT_CONTEST_DATE,
} from "./roomLists";

// antetul listelor (ediția, data) – reținut în browser, ca să nu fie reintrodus la fiecare deschidere
const HEADER_STORAGE_KEY = "repartizare-antet";
const loadHeader = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(HEADER_STORAGE_KEY));
        if (saved && typeof saved === "object") {
            return { edition: DEFAULT_EDITION, date: DEFAULT_CONTEST_DATE, ...saved };
        }
    } catch {
        // fără localStorage → valorile implicite
    }
    return { edition: DEFAULT_EDITION, date: DEFAULT_CONTEST_DATE };
};

// Codurile de anonimizare sunt salvate în colecția `codes` (un document per cod, id = codul).
// Un cod dat rămâne al elevului pentru totdeauna; elevii noi continuă numerotarea.
const CODES_COLLECTION = "codes";
const normName = (s) =>
    String(s || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

// leagă codurile salvate de elevii actuali: întâi după înscriere + nume; dacă într-o înscriere
// a rămas exact un cod nelegat și exact un elev fără cod, înseamnă că numele a fost corectat
// între timp → elevul își păstrează codul.
const attachCodes = (students, codeDocs) => {
    const byKey = new Map();
    codeDocs.forEach((c) => byKey.set(`${c.regId}|${normName(c.nume)}`, c));
    const used = new Set();
    const result = students.map((s) => {
        const c = byKey.get(`${s.regId}|${normName(s.nume)}`);
        if (c && !used.has(c.cod)) {
            used.add(c.cod);
            return { ...s, cod: c.cod };
        }
        return s;
    });
    const freeByReg = {};
    codeDocs
        .filter((c) => !used.has(c.cod))
        .forEach((c) => (freeByReg[c.regId] = freeByReg[c.regId] || []).push(c));
    const renamed = [];
    const withoutByReg = {};
    result.forEach((s, i) => {
        if (!s.cod) (withoutByReg[s.regId] = withoutByReg[s.regId] || []).push(i);
    });
    Object.entries(withoutByReg).forEach(([regId, idxs]) => {
        const free = freeByReg[regId] || [];
        if (idxs.length === 1 && free.length === 1) {
            result[idxs[0]] = { ...result[idxs[0]], cod: free[0].cod };
            used.add(free[0].cod);
            renamed.push({ cod: free[0].cod, nume: result[idxs[0]].nume });
        }
    });
    const orphans = codeDocs.filter((c) => !used.has(c.cod));
    return { students: result, renamed, orphans };
};

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
    const [studentStats, setStudentStats] = useState(
        CLASS_ORDER.reduce((acc, cls) => ({ ...acc, [cls]: 0 }), { total: 0 })
    );

    useEffect(() => {
        loadData();
    }, []);

    const updateHeader = (field, value) => {
        setHeader((prev) => {
            const next = { ...prev, [field]: value };
            try {
                localStorage.setItem(HEADER_STORAGE_KEY, JSON.stringify(next));
            } catch {
                // nu se poate salva → rămâne doar pentru sesiunea curentă
            }
            return next;
        });
    };

    const showMessage = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 5000);
    };

    // ====== ÎNCĂRCARE DATE ======
    const loadData = async () => {
        try {
            setLoading(true);

            // Școli
            const schoolsSnap = await getDocs(collection(db, "schools"));
            const schoolsMap = {};
            schoolsSnap.forEach((doc) => {
                schoolsMap[doc.id] = doc.data().name || "Școală Necunoscută";
            });

            // Elevi
            const regsSnap = await getDocs(collection(db, "registration"));
            const studentsData = [];
            const stats = CLASS_ORDER.reduce(
                (acc, cls) => ({ ...acc, [cls]: 0 }),
                {}
            );

            regsSnap.forEach((doc) => {
                const data = doc.data();
                const studentsArr = Array.isArray(data.students)
                    ? data.students
                    : [];
                const studentClass = data.class ? data.class.trim() : "";
                const schoolName =
                    schoolsMap[data.schoolId] || "Școală Necunoscută";

                studentsArr.forEach((student) => {
                    const nume =
                        typeof student === "string"
                            ? student
                            : student?.nume || "";
                    if (nume) {
                        studentsData.push({
                            nume,
                            clasa: studentClass,
                            scoala: schoolName,
                            profesor: data.profesorIndrumatorEmail || "",
                            id: `${doc.id}-${nume}`,
                            regId: doc.id,
                        });

                        if (stats[studentClass] !== undefined) {
                            stats[studentClass]++;
                        }
                    }
                });
            });

            // sortare globală (clasă + nume) – utilă și pentru export
            studentsData.sort((a, b) => {
                const classAIndex = CLASS_ORDER.indexOf(a.clasa);
                const classBIndex = CLASS_ORDER.indexOf(b.clasa);

                if (classAIndex !== classBIndex)
                    return classAIndex - classBIndex;

                return a.nume.localeCompare(b.nume, "ro", {
                    sensitivity: "base",
                });
            });

            // Coduri de anonimizare deja date
            let codeDocs = [];
            try {
                const codesSnap = await getDocs(collection(db, CODES_COLLECTION));
                codeDocs = codesSnap.docs.map((d) => ({ cod: d.id, ...d.data() }));
            } catch (err) {
                console.error("Eroare la citirea codurilor:", err);
                showMessage("error", "❌ Codurile de anonimizare nu au putut fi citite.");
            }
            setLastCodeN(codeDocs.reduce((m, c) => Math.max(m, c.n || 0), 0));
            const attached = attachCodes(studentsData, codeDocs);
            setOrphanCodes(attached.orphans);
            if (attached.renamed.length > 0) {
                // numele corectate se actualizează și în borderoul salvat
                const batch = writeBatch(db);
                attached.renamed.forEach(({ cod, nume }) =>
                    batch.update(doc(db, CODES_COLLECTION, cod), { nume })
                );
                await batch.commit();
            }

            setStudents(attached.students);
            setStudentStats({ ...stats, total: studentsData.length });

            // Săli
            const roomsSnap = await getDocs(collection(db, "rooms"));
            const roomsData = roomsSnap.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            }));
            // repartizarea începe de la parter, apoi etajele în ordine; pe etaj după numărul sălii
            setRooms(sortRooms(roomsData));
        } catch (err) {
            console.error("Eroare la încărcarea datelor:", err);
            showMessage("error", "❌ Eroare la încărcarea datelor!");
        } finally {
            setLoading(false);
        }
    };

    // ====== GENEREAZĂ REPARTIZARE ======
    const handleGenerateAllocation = async () => {
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

    // ====== ANONIMIZARE (coduri MMVS_01 ...) ======
    const hasCodes = !!allocationResult?.some((s) => s.cod);
    const withoutCode = allocationResult
        ? allocationResult.filter((s) => !s.cod).length
        : students.filter((s) => !s.cod).length;

    const handleGenerateCodes = async () => {
        if (!allocationResult || allocationResult.length === 0 || withoutCode === 0) return;
        if (
            !window.confirm(
                `Se vor da coduri definitive pentru ${withoutCode} elevi, începând cu ${CODE_PREFIX}_${String(lastCodeN + 1).padStart(2, "0")}.\n` +
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
            const { allocation, added } = assignNewCodes(allocationResult, rooms, lastN);

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
                `✅ ${added.length} coduri noi salvate (${added[0]?.cod} … ${added[added.length - 1]?.cod}).`
            );
        } catch (err) {
            console.error("Eroare la salvarea codurilor:", err);
            showMessage("error", "❌ Codurile nu au putut fi salvate. Nu s-a schimbat nimic.");
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
