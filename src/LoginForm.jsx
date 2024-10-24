import React, { useState } from "react";
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence } from "firebase/auth";
import { auth } from "./firebase"; // Importă Authentication din Firebase
import { useNavigate } from "react-router-dom"; // Importă useNavigate pentru redirecționare
import styles from "./LoginForm.module.css"; // Importă stilurile

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate(); // Inițializează hook-ul pentru navigare

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      // Setăm persistența autentificării în localStorage
      await setPersistence(auth, browserLocalPersistence);

      // Autentificare cu email și parolă
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      console.log("Autentificare reușită:", user);

      // Redirecționează utilizatorul către pagina de admin după autentificare
      navigate("/admin");
    } catch (err) {
      setError("Autentificare eșuată");
      console.error("Eroare la autentificare:", err);
    }
  };

  return (
    <div className={styles.loginContainer}>
      <form className={styles.loginForm} onSubmit={handleLogin}>
        <h2>Autentificare Admin</h2>
        {error && <p className={styles.error}>{error}</p>}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={styles.inputField} required />
        <input type="password" placeholder="Parola" value={password} onChange={(e) => setPassword(e.target.value)} className={styles.inputField} required />
        <button type="submit" className={styles.submitButton}>
          Autentificare
        </button>
      </form>
    </div>
  );
}

export default LoginForm;
