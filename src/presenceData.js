// Prezența la concurs, citită direct din baza de date (se poate folosi din orice pagină):
// elevii repartizați în săli + bifele „absent” de la Notare + elevii veniți pe loc.
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { allocateKeepingCodes, sortRooms } from "./allocation";
import { loadAllocation } from "./allocationStore";
import { loadContestStudents } from "./contestData";
import { GRADES_COLLECTION, isAbsentIn } from "./grading";

export const loadPresence = async () => {
  const [data, roomsSnap, saved, gradesSnap] = await Promise.all([
    loadContestStudents(),
    getDocs(collection(db, "rooms")),
    loadAllocation(),
    getDocs(collection(db, GRADES_COLLECTION)),
  ]);
  // fără coduri, notele și bifele „absent” puse pe cod nu se văd: documentul ar ieși greșit
  if (data.codesError) throw new Error("Codurile de anonimizare nu au putut fi citite. Reîncercați.");
  const rooms = sortRooms(roomsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
  const placed = allocateKeepingCodes(data.students, rooms, {
    saved: saved?.assignments || new Map(),
    placeNew: false,
  }).data;
  const gradesById = Object.fromEntries(gradesSnap.docs.map((d) => [d.id, d.data()]));
  const walkIns = new Map((saved?.walkIns || []).map((w) => [w.id, w]));
  const students = placed.map((s) => ({
    ...s,
    absent: isAbsentIn(s, gradesById),
    walkIn: walkIns.has(s.id),
    inLocul: walkIns.get(s.id)?.inLocul || null,
  }));
  const registered = {};
  data.students.forEach((s) => (registered[s.clasa] = (registered[s.clasa] || 0) + 1));
  return {
    students,
    rooms,
    registered,
    registeredTotal: data.students.length,
    absentCount: students.filter((s) => s.absent).length,
  };
};
