import React, { createContext, useContext, useEffect, useState } from "react";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

// Creăm contextul pentru autentificare
const AuthContext = createContext();

// Hook personalizat pentru a folosi contextul de autentificare
export const useAuth = () => {
  return useContext(AuthContext);
};

// Admin = contul are un document admins/{uid} (creat manual din consola Firebase).
// Regulile Firestore verifică același lucru, deci asta e doar pentru afișare.
// Dacă citirea e refuzată (regulile vechi, fără colecția admins), considerăm contul
// admin: atunci serverul încă tratează orice cont autentificat ca admin.
const checkAdmin = async (user) => {
  try {
    const snap = await getDoc(doc(db, "admins", user.uid));
    return snap.exists();
  } catch (err) {
    if (err?.code === "permission-denied") return true;
    console.error("Verificarea drepturilor de admin a eșuat:", err);
    return true; // fără rețea: serverul oricum refuză ce nu e permis
  }
};

// Provider pentru autentificare care va înconjura aplicația
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const auth = getAuth();

  useEffect(() => {
    // Ascultăm schimbările de stare ale autentificării
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setIsAdmin(user ? await checkAdmin(user) : false);
      setCurrentUser(user);
      setLoading(false);
    });

    return () => unsubscribe(); // Curățăm ascultătorul
  }, [auth]);

  const logout = () => {
    return signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ currentUser, isAdmin, logout }}>
      {!loading && children} {/* Nu afișăm copii până nu terminăm de încărcat */}
    </AuthContext.Provider>
  );
};
