import React, { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc } from "firebase/firestore";
import { db } from "./firebase"; // Asigură-te că exportul db este corect
import styles from "./RoomAllocation.module.css";
import { duplicateRoomNames, sortRooms } from "./allocation";
import { loadAllocation } from "./allocationStore";
import { loadContestStudents } from "./contestData";
import { AllocationLogCard } from "./AllocationLog";
import { diffWithAllocation } from "./studentSync";

// Săli pre-configurate cu dimensiunea matriceală (rânduri x coloane)
const DEFAULT_ROOMS = [
    { name: "Sala 6", floor: "Etaj I", seats: 25, rows: 5, cols: 5 },
    { name: "Sala 7", floor: "Etaj I", seats: 23, rows: 5, cols: 5 },
    { name: "Sala 8", floor: "Etaj I", seats: 25, rows: 5, cols: 5 },
    { name: "Sala 9", floor: "Etaj I", seats: 25, rows: 5, cols: 5 },
    { name: "Sala 10", floor: "Etaj I", seats: 25, rows: 5, cols: 5 },
    { name: "Sala 11", floor: "Etaj I", seats: 23, rows: 5, cols: 5 },
    { name: "Sala 15", floor: "Etaj II", seats: 25, rows: 5, cols: 5 },
    { name: "Sala 16", floor: "Etaj II", seats: 25, rows: 5, cols: 5 },
    { name: "Sala 17", floor: "Etaj II", seats: 24, rows: 5, cols: 5 },
    { name: "Sala 18", floor: "Etaj II", seats: 20, rows: 5, cols: 4 }, // Ex: mai mic
    { name: "Sala 19", floor: "Etaj II", seats: 5, rows: 3, cols: 2 }, // Ex: foarte mic
];

function RoomAllocation({ onNextStep, onCancel, stageBar }) {
    const [rooms, setRooms] = useState([]);
    const [showAddRoomForm, setShowAddRoomForm] = useState(false);
    const [loading, setLoading] = useState(true);

    // State pentru formular (add + edit)
    const [isEditing, setIsEditing] = useState(false);
    const [editingRoomId, setEditingRoomId] = useState(null);
    const [roomName, setRoomName] = useState("");
    const [roomFloor, setRoomFloor] = useState("");
    const [roomSeats, setRoomSeats] = useState("");
    const [message, setMessage] = useState(null);

    useEffect(() => {
        loadRooms();
    }, []);

    // jurnalul repartizării + câți elevi s-au înscris după ea
    const [savedAlloc, setSavedAlloc] = useState(undefined);
    const [allocDiff, setAllocDiff] = useState({ realNew: 0, pairs: 0, ghosts: 0 });
    useEffect(() => {
        let alive = true;
        // întâi elevii (numele corectate recunoscute automat se salvează), apoi repartizarea
        loadContestStudents()
            .then(async (data) => {
                const saved = await loadAllocation();
                if (!alive) return;
                setSavedAlloc(saved);
                if (saved) {
                    const diff = diffWithAllocation(data.students, saved.assignments, data.orphans);
                    setAllocDiff({
                        realNew: diff.realNew.length,
                        pairs: diff.pairs.length,
                        ghosts: diff.unpairedGhosts.length,
                    });
                }
            })
            .catch((err) => {
                console.error("Eroare la citirea jurnalului repartizării:", err);
                if (alive) setSavedAlloc(null);
            });
        return () => {
            alive = false;
        };
    }, []);

    const showMessage = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 4000);
    };

    // ====== FIREBASE - ÎNCĂRCARE SĂLI ======
    const loadRooms = async () => {
        try {
            setLoading(true);
            const snap = await getDocs(collection(db, "rooms"));

            // (sălile pre-configurate se adaugă doar la cerere, cu butonul de mai jos)
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            // ordinea repartizării: de la parter, apoi etajele; pe etaj Sala 1, Sala 2, ... Sala 10
            setRooms(sortRooms(list));
        } catch (err) {
            console.error("Eroare la încărcarea sălilor:", err);
            showMessage("error", "❌ Eroare la încărcarea sălilor!");
        } finally {
            setLoading(false);
        }
    };

    // ====== SĂLILE PRE-CONFIGURATE (la cerere) ======
    // ID-uri fixe (implicit_0, implicit_1, ...): două ferestre care apasă deodată
    // scriu aceleași documente, nu dublează sălile
    const initializeDefaultRooms = async () => {
        try {
            const promises = DEFAULT_ROOMS.map((room, i) =>
                setDoc(doc(db, "rooms", `implicit_${i}`), room)
            );
            await Promise.all(promises);

            // Reîncarcă sălile
            const snap = await getDocs(collection(db, "rooms"));
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setRooms(sortRooms(list));
            
            showMessage("success", "✅ Sălile pre-configurate au fost adăugate!");
        } catch (err) {
            console.error("Eroare la popularea automată:", err);
            showMessage("error", "❌ Eroare la popularea automată!");
        }
    };

    // ====== ADĂUGARE/EDITARE SALĂ ======
    const handleAddOrEditRoom = async (e) => {
        e.preventDefault();

        const seatsNum = parseInt(roomSeats);

        // Validare de bază
        if (!roomName.trim()) {
            showMessage("error", "Numele sălii este obligatoriu!");
            return;
        }

        // Validare locuri
        if (isNaN(seatsNum) || seatsNum <= 0) {
            showMessage("error", "Numărul de locuri trebuie să fie pozitiv!");
            return;
        }

        // numele sălii e cheia repartizării: două săli cu același nume ar dubla elevii pe liste
        const norm = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
        const clash = rooms.find((r) => r.id !== editingRoomId && norm(r.name) === norm(roomName));
        if (clash) {
            showMessage("error", `Există deja o sală cu numele „${clash.name}”. Alegeți alt nume.`);
            return;
        }

        try {
            const roomData = {
                name: roomName.trim(),
                floor: roomFloor.trim() || "Nespecificat",
                seats: seatsNum,
            };
            
            if (isEditing && editingRoomId) {
                // EDITARE
                await updateDoc(doc(db, "rooms", editingRoomId), roomData);
                showMessage("success", `✅ Sala "${roomName}" a fost actualizată!`);
            } else {
                // ADĂUGARE NOUĂ
                await addDoc(collection(db, "rooms"), roomData);
                showMessage("success", `✅ Sala "${roomName}" a fost adăugată!`);
            }

            resetForm();
            await loadRooms(); // Reîncarcă sălile
        } catch (err) {
            console.error("Eroare la salvarea sălii:", err);
            showMessage("error", "❌ Eroare la salvarea sălii! Verificați permisiunile.");
        }
    };

    // ====== EDITARE SALĂ ======
    const handleEditRoom = (room) => {
        setIsEditing(true);
        setEditingRoomId(room.id);
        setRoomName(room.name);
        setRoomFloor(room.floor || "");
        setRoomSeats(String(room.seats));
        setShowAddRoomForm(true);
    };

    // ====== ȘTERGERE SALĂ ======
    const handleDeleteRoom = async (roomId) => {
        const room = rooms.find((r) => r.id === roomId);
        if (!room) return;

        if (!window.confirm(`Sigur doriți să ștergeți sala "${room.name}"?`)) {
            return;
        }

        try {
            await deleteDoc(doc(db, "rooms", roomId));
            showMessage("success", `✅ Sala "${room.name}" a fost ștearsă!`);
            await loadRooms();
        } catch (err) {
            console.error("Eroare la ștergerea sălii:", err);
            showMessage("error", "❌ Eroare la ștergerea sălii!");
        }
    };

    // ====== RESET FORMULAR ======
    const resetForm = () => {
        setRoomName("");
        setRoomFloor("");
        setRoomSeats("");
        setIsEditing(false);
        setEditingRoomId(null);
        setShowAddRoomForm(false);
    };

    const totalSeats = rooms.reduce((sum, room) => sum + (parseInt(room.seats) || 0), 0);
    const roomsCount = rooms.length;

    if (loading) {
        return (
            <div className={styles.container}>
                {stageBar}
                <h1 className={styles.title}>🏫 Săli</h1>
                <p className={styles.emptyMessage}>Se încarcă sălile...</p>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {stageBar}
            <h1 className={styles.title}>🏫 Săli</h1>

            {/* Mesaje */}
            {message && (
                <div className={message.type === "success" ? styles.successMessage : styles.errorMessage}>
                    {message.text}
                </div>
            )}

            <div className={styles.buttonContainer}>
                {onCancel && (
                    <button onClick={onCancel} className={styles.dashboardButton}>
                        ← Panou Admin
                    </button>
                )}
                <button
                    onClick={() => {
                        if (showAddRoomForm && !isEditing) {
                            resetForm();
                        } else {
                            setShowAddRoomForm((v) => !v);
                            if (isEditing) resetForm();
                        }
                    }}
                    className={styles.addButton}
                >
                    {showAddRoomForm ? "Ascunde formularul" : "➕ Adaugă Sală / Editează"}
                </button>
            </div>

            {/* FORMULAR ADĂUGARE/EDITARE SALĂ */}
            {showAddRoomForm && (
                <form onSubmit={handleAddOrEditRoom} className={styles.formContainer}>
                    <p className={styles.formTitle}>
                        {isEditing ? `Editează sala: ${rooms.find((r) => r.id === editingRoomId)?.name || roomName}` : "Adaugă o sală nouă"}
                    </p>

                    <input type="text" value={roomName} onChange={(e) => setRoomName(e.target.value)}
                        placeholder="Nume sală (ex: Sala 6)" className={styles.inputField} autoFocus required/>
                    <input type="text" value={roomFloor} onChange={(e) => setRoomFloor(e.target.value)}
                        placeholder="Etaj (ex: Etaj I)" className={styles.inputField}/>

                    <input type="number" value={roomSeats} onChange={(e) => setRoomSeats(e.target.value)}
                        placeholder="Număr locuri" className={styles.inputField} min="1" required/>

                    <div className={styles.formActions}>
                        <button type="submit" className={styles.submitButton}>
                            {isEditing ? "💾 Salvează Modificările" : "➕ Adaugă Sala"}
                        </button>
                        <button type="button" onClick={resetForm} className={styles.cancelButton}>
                            ❌ Anulează
                        </button>
                    </div>
                </form>
            )}

            {/* INFO BOX - STATISTICI */}
            {roomsCount > 0 && (
                <div className={styles.infoBox}>
                    <h3>📊 Informații Generale</h3>
                    <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Săli configurate:</span>
                        <span className={styles.infoValue}>{roomsCount}</span>
                    </div>
                    <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Total locuri disponibile:</span>
                        <span className={styles.infoValue}>{totalSeats}</span>
                    </div>
                </div>
            )}

            {savedAlloc !== undefined && (
                <AllocationLogCard
                    saved={savedAlloc}
                    newCount={allocDiff.realNew}
                    renamedCount={allocDiff.pairs}
                    ghostCount={allocDiff.ghosts}
                    onOpen={onNextStep}
                />
            )}

            {/* BUTON URMĂTORUL PAS */}
            {roomsCount > 0 ? (
                <div className={styles.nextStepContainer}>
                    <button onClick={onNextStep} className={styles.nextStepButton}>
                        <span className={styles.nextStepIcon} aria-hidden="true">🎯</span>
                        <span className={styles.nextStepText}>
                            <span className={styles.nextStepLabel}>Următorul pas</span>
                            <span className={styles.nextStepTitle}>🪑 Repartizare</span>
                        </span>
                        <span className={styles.nextStepArrow} aria-hidden="true">→</span>
                    </button>
                </div>
            ) : (
                <div className={styles.warningBox}><p>⚠️ Adaugă cel puțin o sală pentru a continua.</p></div>
            )}


            {/* LISTĂ SĂLI */}
            {roomsCount > 0 && (
                <div className={styles.roomsListContainer}>
                    <h2 className={styles.subtitle}>Lista Sălilor Configurate:</h2>

                    {rooms.map((room) => (
                        <div key={room.id} className={styles.roomCard}>
                            <div className={styles.roomInfo}>
                                <div className={styles.roomName}>
                                    {room.name}
                                </div>
                                <div className={styles.roomDetails}>
                                    {room.floor && `${room.floor}`} • {room.seats} locuri
                                </div>
                            </div>
                            <div className={styles.roomActions}>
                                <button
                                    onClick={() => handleEditRoom(room)}
                                    className={styles.editRoomButton}
                                >
                                    ✏️ Editează
                                </button>
                                <button
                                    onClick={() => handleDeleteRoom(room.id)}
                                    className={styles.deleteRoomButton}
                                >
                                    🗑️ Șterge
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* MESAJ GOL */}
            {roomsCount === 0 && !loading && (
                <div className={styles.emptyMessage}>
                    <p>Nu există săli configurate.</p>
                    <button type="button" className={styles.submitButton} onClick={initializeDefaultRooms}>
                        Adaugă sălile pre-configurate ale școlii ({DEFAULT_ROOMS.length})
                    </button>
                </div>
            )}

            {duplicateRoomNames(rooms).length > 0 && (
                <p className={styles.emptyMessage} role="alert" style={{ color: "#b91c1c" }}>
                    ⚠️ Aceeași sală apare de mai multe ori: {duplicateRoomNames(rooms).join(", ")}. Ștergeți sau
                    redenumiți dublura, altfel elevii ar apărea de două ori pe liste.
                </p>
            )}
        </div>
    );
}

export default RoomAllocation;