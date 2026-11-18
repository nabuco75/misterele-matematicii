// Repartizarea salvată în baza de date (config/allocation), ca să nu se piardă la închiderea paginii,
// plus un jurnal cu fiecare repartizare: când, ce fel, câți elevi, câte săli, cât loc a rămas.
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { allocationStats } from "./allocation";

const allocationDoc = () => doc(db, "config", "allocation");
const HISTORY_LIMIT = 30;

export const ALLOCATION_TYPES = {
  completa: "Repartizare completă",
  "elevi-noi": "Elevi noi adăugați",
  "din-coduri": "Reconstituită din coduri",
};

// { assignments: Map id → sală, last, history } sau null dacă nu s-a salvat nicio repartizare
export const loadAllocation = async () => {
  const snap = await getDoc(allocationDoc());
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    assignments: new Map((data.assignments || []).map((a) => [a.id, a.sala])),
    last: data.history?.[0] || null,
    history: data.history || [],
  };
};

export const saveAllocation = async ({ data, roomSummaries, rooms, type, added = 0, previous }) => {
  const entry = {
    at: new Date().toISOString(),
    type,
    added,
    ...allocationStats(roomSummaries, rooms),
  };
  const history = [entry, ...(previous?.history || [])].slice(0, HISTORY_LIMIT);
  await setDoc(allocationDoc(), {
    assignments: data.map((s) => ({ id: s.id, sala: s.sala })),
    history,
  });
  return {
    assignments: new Map(data.map((s) => [s.id, s.sala])),
    last: entry,
    history,
  };
};

// „18 noiembrie 2026, ora 22:15”
export const formatWhen = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ora ${time}`;
};
