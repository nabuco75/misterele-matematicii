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
  "anulare-coduri": "Anonimizare anulată (coduri șterse)",
};

// evenimente din jurnal care nu sunt repartizări (nu devin „ultima repartizare”)
const EVENT_TYPES = new Set(["anulare-coduri"]);
const lastAllocation = (history) => history.find((h) => !EVENT_TYPES.has(h.type)) || null;

// adaugă în jurnal un eveniment (ex. anularea anonimizării), cu statistica repartizării curente
export const logAllocationEvent = async ({ type, roomSummaries, rooms, previous, details = {} }) => {
  const entry = { at: new Date().toISOString(), type, ...details, ...allocationStats(roomSummaries, rooms) };
  const history = [entry, ...(previous?.history || [])].slice(0, HISTORY_LIMIT);
  await setDoc(allocationDoc(), { history }, { merge: true });
  return { ...(previous || { assignments: new Map(), lastNewCodes: null }), history, last: lastAllocation(history) };
};

// { assignments: Map id → sală, last, history } sau null dacă nu s-a salvat nicio repartizare
export const loadAllocation = async () => {
  const snap = await getDoc(allocationDoc());
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    assignments: new Map((data.assignments || []).map((a) => [a.id, a.sala])),
    last: lastAllocation(data.history || []),
    history: data.history || [],
    lastNewCodes: data.lastNewCodes || null,
  };
};

// ultimele coduri date (pentru biletele „doar elevii noi”)
export const saveLastNewCodes = async (codes) => {
  const lastNewCodes = { at: new Date().toISOString(), codes };
  await setDoc(allocationDoc(), { lastNewCodes }, { merge: true });
  return lastNewCodes;
};

export const saveAllocation = async ({ data, roomSummaries, rooms, type, added = 0, previous }) => {
  const entry = {
    at: new Date().toISOString(),
    type,
    added,
    ...allocationStats(roomSummaries, rooms),
  };
  const history = [entry, ...(previous?.history || [])].slice(0, HISTORY_LIMIT);
  await setDoc(
    allocationDoc(),
    {
      assignments: data.map((s) => ({ id: s.id, sala: s.sala })),
      history,
    },
    { merge: true }
  );
  return {
    assignments: new Map(data.map((s) => [s.id, s.sala])),
    last: lastAllocation(history),
    history,
    lastNewCodes: previous?.lastNewCodes || null,
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
