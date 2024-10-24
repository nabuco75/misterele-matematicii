import React, { createContext, useContext, useEffect, useState } from "react";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";

// Creăm contextul pentru autentificare
const AuthContext = createContext();

// Hook personalizat pentru a folosi contextul de autentificare
export const useAuth = () => {
  return useContext(AuthContext);
};

// Provider pentru autentificare care va înconjura aplicația
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const auth = getAuth();

  useEffect(() => {
    // Ascultăm schimbările de stare ale autentificării
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    return () => unsubscribe(); // Curățăm ascultătorul
  }, [auth]);

  const logout = () => {
    return signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ currentUser, logout }}>
      {!loading && children} {/* Nu afișăm copii până nu terminăm de încărcat */}
    </AuthContext.Provider>
  );
};
