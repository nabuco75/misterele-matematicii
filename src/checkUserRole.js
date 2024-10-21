import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase"; // Importă instanța Firestore

async function checkUserRole(userId) {
  const userRef = doc(db, "users", userId); // Se referă la colecția "users" și la documentul userId
  const userDoc = await getDoc(userRef);

  if (userDoc.exists()) {
    const userData = userDoc.data();
    return userData.role; // Returnează rolul utilizatorului
  } else {
    throw new Error("Utilizatorul nu a fost găsit");
  }
}

export default checkUserRole;
