import React, { useState } from "react";
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence } from "firebase/auth";
import { auth } from "./firebase"; // Importă Authentication din Firebase
import { useNavigate } from "react-router-dom"; // Importă useNavigate pentru redirecționare
import styles from "./LoginForm.module.css"; // Importă stilurile
import AuroraStage from "./Aurora";

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
      await signInWithEmailAndPassword(auth, email, password);

      // Redirecționează utilizatorul către pagina de admin după autentificare
      navigate("/admin");
    } catch (err) {
      setError("Autentificare eșuată");
      console.error("Eroare la autentificare:", err);
    }
  };

  return (
    <AuroraStage>
    <div className={styles.loginContainer}>
      <form className={styles.loginForm} onSubmit={handleLogin}>
        <span className={styles.badge} aria-hidden="true">∑</span>
        <h2>Autentificare admin</h2>
        <p className={styles.hint}>Panoul organizatorilor concursului Misterele Matematicii.</p>
        {error && <p className={styles.error}>{error}</p>}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={styles.inputField} required />
        <input type="password" placeholder="Parola" value={password} onChange={(e) => setPassword(e.target.value)} className={styles.inputField} required />
        <button type="submit" className={styles.submitButton}>
          Autentificare
        </button>
      </form>
    </div>
    </AuroraStage>
  );
}

export default LoginForm;
