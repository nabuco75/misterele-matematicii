// Setările concursului comune tuturor calculatoarelor: antetul listelor (ediția, data)
// și sumele premiilor în bani. Se țin în config/settings; în browser rămâne o copie
// (localStorage), ca paginile să le poată citi imediat, fără așteptare.
//
// La deschiderea panoului de admin, syncSettings() aduce valorile din baza de date peste
// copia locală. Orice modificare se scrie în ambele locuri.
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export const HEADER_STORAGE_KEY = "repartizare-antet";
export const AMOUNTS_STORAGE_KEY = "mm_prize_amounts";

// câmpul din config/settings ↔ cheia din localStorage
const FIELDS = { header: HEADER_STORAGE_KEY, prizeAmounts: AMOUNTS_STORAGE_KEY };

const settingsRef = () => doc(db, "config", "settings");

const readLocal = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
};
const writeLocal = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // fără localStorage → rămâne doar în baza de date
  }
};

// Baza de date câștigă. Dacă acolo lipsește o setare, dar calculatorul acesta o are
// (setată înainte de mutarea în baza de date), o urcăm, ca să ajungă și la ceilalți.
export async function syncSettings() {
  const snap = await getDoc(settingsRef());
  const server = snap.exists() ? snap.data() : {};
  const upload = {};
  Object.entries(FIELDS).forEach(([field, key]) => {
    if (server[field] && typeof server[field] === "object") writeLocal(key, server[field]);
    else {
      const local = readLocal(key);
      if (local && typeof local === "object") upload[field] = local;
    }
  });
  if (Object.keys(upload).length) await setDoc(settingsRef(), upload, { merge: true });
}

// scrierea în baza de date se face la 0,8 s după ultima tastă (nu la fiecare literă)
const timers = {};
export function saveSetting(field, value) {
  writeLocal(FIELDS[field], value);
  clearTimeout(timers[field]);
  timers[field] = setTimeout(() => {
    setDoc(settingsRef(), { [field]: value }, { merge: true }).catch((err) =>
      console.error(`Setarea „${field}” nu s-a putut salva în baza de date:`, err)
    );
  }, 800);
}
