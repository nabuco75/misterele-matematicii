import React, { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import styles from "./AllocationProcess.module.css";
import * as FileSaver from "file-saver";
import * as XLSX from "xlsx";

const CLASS_ORDER = ["a IV-a", "a V-a", "a VI-a", "a VII-a"];
const DEFAULT_COLS = 7;

function AllocationProcess({ onBack }) {
    const [loading, setLoading] = useState(true);
    const [students, setStudents] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [allocationResult, setAllocationResult] = useState(null);
    const [message, setMessage] = useState(null);
    const [studentStats, setStudentStats] = useState(
        CLASS_ORDER.reduce((acc, cls) => ({ ...acc, [cls]: 0 }), { total: 0 })
    );

    useEffect(() => {
        loadData();
    }, []);

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

            setStudents(studentsData);
            setStudentStats({ ...stats, total: studentsData.length });

            // Săli
            const roomsSnap = await getDocs(collection(db, "rooms"));
            const roomsData = roomsSnap.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            }));
            roomsData.sort((a, b) =>
                a.name.localeCompare(b.name, "ro", { numeric: true })
            );
            setRooms(roomsData);
        } catch (err) {
            console.error("Eroare la încărcarea datelor:", err);
            showMessage("error", "❌ Eroare la încărcarea datelor!");
        } finally {
            setLoading(false);
        }
    };

    // ====== HELPERI PENTRU LOGICA DE AȘEZARE ======

    // generăm structura cu săli, matrice și poziții „șarpe”
    const buildRoomStates = () => {
        const roomStates = [];

        for (const room of rooms) {
            const totalRoomSeats = parseInt(room.seats) || 0;
            const cols = parseInt(room.cols) || DEFAULT_COLS;
            const rows =
                parseInt(room.rows) || Math.ceil(totalRoomSeats / cols);

            const matrix = {};
            const positions = [];

            for (let r = 1; r <= rows; r++) {
                matrix[r] = {};
                const isOddRow = r % 2 !== 0;

                if (isOddRow) {
                    for (let c = 1; c <= cols; c++) {
                        positions.push([r, c]);
                    }
                } else {
                    for (let c = cols; c >= 1; c--) {
                        positions.push([r, c]);
                    }
                }
            }

            const validPositions = positions.slice(0, totalRoomSeats);

            roomStates.push({
                room,
                rows,
                cols,
                matrix,
                positions: validPositions,
            });
        }

        return roomStates;
    };

    // verificare strictă (lateral + vertical)
    const isValidPlacementStrict = (matrix, row, col, studentClass, cols) => {
        const isOddRow = row % 2 !== 0;

        // lateral în „șarpe”
        if (isOddRow && col > 1) {
            if (matrix[row]?.[col - 1] === studentClass) return false;
        } else if (!isOddRow && col < cols) {
            if (matrix[row]?.[col + 1] === studentClass) return false;
        }

        // deasupra
        if (row > 1) {
            if (matrix[row - 1]?.[col] === studentClass) return false;
        }

        return true;
    };

    // verificare relaxată (doar lateral)
    const isValidPlacementLoose = (matrix, row, col, studentClass, cols) => {
        const isOddRow = row % 2 !== 0;

        if (isOddRow && col > 1) {
            if (matrix[row]?.[col - 1] === studentClass) return false;
        } else if (!isOddRow && col < cols) {
            if (matrix[row]?.[col + 1] === studentClass) return false;
        }

        return true;
    };

    // algoritm global: parcurge TOATE locurile din toate sălile
    const runGlobalAllocation = () => {
        const roomStates = buildRoomStates();

        // pool-uri pe clase – păstrăm ordinea alfabetică în interiorul fiecărei clase
        const classPools = {};
        const remainingByClass = {};

        CLASS_ORDER.forEach((cls) => {
            const arr = students.filter((s) => s.clasa === cls);
            classPools[cls] = arr;
            remainingByClass[cls] = arr.length;
        });

        const totalStudents = students.length;
        const allPositions = [];
        const roomAllocatedCount = {};
        const distributedData = [];

        // listă globală cu (sala, r, c)
        roomStates.forEach((state) => {
            state.positions.forEach(([r, c]) => {
                allPositions.push({ state, r, c });
            });
        });

        const totalSeats = allPositions.length;

        const getRemainingTotal = () =>
            CLASS_ORDER.reduce(
                (sum, cls) => sum + (remainingByClass[cls] || 0),
                0
            );

        const placeStudent = (student, cls, state, r, c) => {
            const { room, matrix } = state;
            matrix[r][c] = cls;

            roomAllocatedCount[room.name] =
                (roomAllocatedCount[room.name] || 0) + 1;

            distributedData.push({
                ...student,
                sala: room.name,
                rand: r,
                loc: c,
                loc_in_sala: roomAllocatedCount[room.name],
            });

            remainingByClass[cls]--;
        };

        // ====== FAZA 1 – STRICTĂ ======
        for (const { state, r, c } of allPositions) {
            if (getRemainingTotal() === 0) break;
            const { matrix, cols } = state;
            if (matrix[r][c]) continue;

            let placed = false;

            // ordinea claselor: cele cu mai mulți elevi rămași primele
            const classesByNeed = [...CLASS_ORDER].sort(
                (a, b) => (remainingByClass[b] || 0) - (remainingByClass[a] || 0)
            );

            for (const cls of classesByNeed) {
                if (!remainingByClass[cls]) continue;

                if (!isValidPlacementStrict(matrix, r, c, cls, cols))
                    continue;

                const student = classPools[cls].shift();
                if (!student) continue;

                placeStudent(student, cls, state, r, c);
                placed = true;
                break;
            }

            // dacă nu am reușit cu reguli stricte, locul rămâne liber pentru faza 2
        }

        // ====== FAZA 2 – RELAXATĂ (doar lateral) ======
        if (getRemainingTotal() > 0) {
            for (const { state, r, c } of allPositions) {
                if (getRemainingTotal() === 0) break;
                const { matrix, cols } = state;
                if (matrix[r][c]) continue;

                let placed = false;

                for (const cls of CLASS_ORDER) {
                    if (!remainingByClass[cls]) continue;

                    if (!isValidPlacementLoose(matrix, r, c, cls, cols))
                        continue;

                    const student = classPools[cls].shift();
                    if (!student) continue;

                    placeStudent(student, cls, state, r, c);
                    placed = true;
                    break;
                }
            }
        }

        // ====== FAZA 3 – FALLBACK TOTAL: nu lăsăm copii pe dinafară dacă sunt locuri ======
        if (getRemainingTotal() > 0 && totalSeats >= totalStudents) {
            for (const { state, r, c } of allPositions) {
                if (getRemainingTotal() === 0) break;
                const { matrix } = state;
                if (matrix[r][c]) continue;

                const cls = CLASS_ORDER.find((cl) => remainingByClass[cl] > 0);
                if (!cls) break;

                const student = classPools[cls].shift();
                if (!student) break;

                placeStudent(student, cls, state, r, c);
            }
        }

        const unallocated = getRemainingTotal();
        const allocated = totalStudents - unallocated;

        return { data: distributedData, allocated, unallocated };
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
            const result = runGlobalAllocation();

            setAllocationResult(result.data);

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

    // ====== EXPORT EXCEL (fără rand/loc, sortare pe clasă + nume) ======
    const handleExportExcel = () => {
        if (!allocationResult || allocationResult.length === 0) {
            showMessage("warning", "Nu există date de repartizare pentru export!");
            return;
        }

        const groupedByRoom = allocationResult.reduce((acc, item) => {
            const sala = item.sala;
            if (!acc[sala]) acc[sala] = [];
            acc[sala].push(item);
            return acc;
        }, {});

        const workbook = XLSX.utils.book_new();
        const roomNames = Object.keys(groupedByRoom).sort((a, b) =>
            a.localeCompare(b, undefined, { numeric: true })
        );

        roomNames.forEach((sala) => {
            let studentsInRoom = groupedByRoom[sala];

            // sortare după CLASĂ (în ordinea CLASS_ORDER) + NUME
            studentsInRoom.sort((a, b) => {
                const classAIndex = CLASS_ORDER.indexOf(a.clasa);
                const classBIndex = CLASS_ORDER.indexOf(b.clasa);

                if (classAIndex !== classBIndex)
                    return classAIndex - classBIndex;

                return a.nume.localeCompare(b.nume, "ro", {
                    sensitivity: "base",
                });
            });

            const sheetData = studentsInRoom.map((item, index) => ({
                "Nr. Crt.": index + 1,
                "Numele și Prenumele elevului": item.nume,
                Clasa: item.clasa,
                "Numele Școlii Participante": item.scoala,
                "Profesor îndrumător": item.profesor,
            }));

            const ws = XLSX.utils.json_to_sheet(sheetData);
            XLSX.utils.book_append_sheet(workbook, ws, sala);
        });

        const excelBuffer = XLSX.write(workbook, {
            bookType: "xlsx",
            type: "array",
        });
        const data = new Blob([excelBuffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8",
        });
        FileSaver.saveAs(
            data,
            `Repartizare_pe_Sali_${new Date().toISOString().slice(0, 10)}.xlsx`
        );

        showMessage("success", "✅ Exportul Excel a fost finalizat!");
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
            </div>

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
