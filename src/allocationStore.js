// Repartizarea salvată în baza de date (config/allocation), ca să nu se piardă la închiderea paginii,
// plus un jurnal cu fiecare repartizare: când, ce fel, câți elevi, câte săli, cât loc a rămas.
import { doc, getDoc, runTransaction } from "firebase/firestore";
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

// starea folosită în pagină, din documentul salvat
const toState = (data) => ({
  assignments: new Map((data.assignments || []).map((a) => [a.id, a.sala])),
  last: lastAllocation(data.history || []),
  history: data.history || [],
  lastNewCodes: data.lastNewCodes || null,
  // elevii veniți pe loc, așezați în locul unui absent (pentru procesul-verbal)
  walkIns: data.walkIns || [],
  // toate tranșele de coduri date (prima anonimizare + fiecare grup de elevi noi);
  // datele vechi aveau doar ultima tranșă: restul codurilor devin tranșa inițială (codes: null =
  // „toate codurile care nu sunt în altă tranșă”), considerată tipărită la anonimizare
  codeBatches:
    data.codeBatches ||
    (data.lastNewCodes
      ? [{ at: "initial", codes: null, printedAt: "initial" }, data.lastNewCodes]
      : []),
});

// Orice scriere în config/allocation pornește de la documentul PROASPĂT, într-o tranzacție.
// Altfel, două calculatoare deschise în ziua concursului își șterg reciproc modificările
// (ex. elevul venit pe loc așezat de pe calculatorul 1 dispare când salvează calculatorul 2).
// fn(dateleCurente) → câmpurile de scris; întoarce documentul după scriere.
const mutateAllocation = (fn) =>
  runTransaction(db, async (tx) => {
    const snap = await tx.get(allocationDoc());
    const cur = snap.exists() ? snap.data() : {};
    const patch = fn(cur);
    tx.set(allocationDoc(), patch, { merge: true });
    return { ...cur, ...patch };
  });

const withHistory = (cur, entry) => [entry, ...(cur.history || [])].slice(0, HISTORY_LIMIT);

// adaugă în jurnal un eveniment (ex. anularea anonimizării), cu statistica repartizării curente
export const logAllocationEvent = async ({ type, roomSummaries, rooms, details = {} }) => {
  const entry = { at: new Date().toISOString(), type, ...details, ...allocationStats(roomSummaries, rooms) };
  return toState(await mutateAllocation((cur) => ({ history: withHistory(cur, entry) })));
};

// { assignments: Map id → sală, last, history, ... } sau null dacă nu s-a salvat nicio repartizare
export const loadAllocation = async () => {
  const snap = await getDoc(allocationDoc());
  if (!snap.exists()) return null;
  return toState(snap.data());
};

// un elev venit pe loc a fost așezat (eventual în locul unui absent): se păstrează pentru procesul-verbal
// (se adaugă la lista proaspătă; întoarce lista completă)
export const saveWalkIn = async (entry) => {
  const data = await mutateAllocation((cur) => ({
    walkIns: [...(cur.walkIns || []).filter((w) => w.id !== entry.id), entry],
  }));
  return data.walkIns;
};

// o tranșă nouă de coduri: devine „ultimele coduri” și se adaugă în lista tranșelor
export const saveLastNewCodes = async (codes) => {
  const lastNewCodes = { at: new Date().toISOString(), codes };
  const data = await mutateAllocation((cur) => ({
    lastNewCodes,
    codeBatches: [...toState(cur).codeBatches, lastNewCodes],
  }));
  return { lastNewCodes: data.lastNewCodes, codeBatches: data.codeBatches };
};

// bilețelele unei tranșe au fost descărcate (tipărite): se notează data
export const markBatchPrinted = async (at) => {
  const printedAt = new Date().toISOString();
  const data = await mutateAllocation((cur) => ({
    codeBatches: toState(cur).codeBatches.map((b) => (b.at === at ? { ...b, printedAt } : b)),
  }));
  return data.codeBatches;
};

// Salvează repartizarea.
// - "completa": noua repartizare înlocuiește tot (refacere deliberată);
// - altfel (elevi noi, elev venit pe loc, din coduri): se scriu DOAR schimbările făcute aici
//   față de `previous`, peste repartizarea proaspătă din baza de date, ca să nu se piardă ce
//   a salvat între timp alt calculator.
export const saveAllocation = async ({ data, roomSummaries, rooms, type, added = 0, previous }) => {
  const entry = {
    at: new Date().toISOString(),
    type,
    added,
    ...allocationStats(roomSummaries, rooms),
  };
  const mine = data.map((s) => ({ id: s.id, sala: s.sala }));
  const saved = await mutateAllocation((cur) => {
    let assignments;
    if (type === "completa") {
      assignments = mine;
    } else {
      const before = previous?.assignments || new Map();
      const merged = new Map((cur.assignments || []).map((a) => [a.id, a.sala]));
      const mineIds = new Set();
      mine.forEach(({ id, sala }) => {
        mineIds.add(id);
        if (before.get(id) !== sala) merged.set(id, sala);
      });
      // scos de aici (era în repartizarea de la care am pornit, nu mai e)
      before.forEach((_, id) => {
        if (!mineIds.has(id)) merged.delete(id);
      });
      assignments = [...merged.entries()].map(([id, sala]) => ({ id, sala }));
    }
    return { assignments, history: withHistory(cur, entry) };
  });
  return toState(saved);
};

// „18 noiembrie 2026, ora 22:15”
export const formatWhen = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ora ${time}`;
};
