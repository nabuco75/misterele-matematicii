import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext"; // Preluăm contextul de autentificare
import styles from "./NavBar.module.css";

function NavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout } = useAuth(); // Preluăm utilizatorul curent și funcția de logout

  const handleLoginClick = () => {
    navigate("/login");
  };

  const handleHomeClick = () => {
    if (location.pathname === "/") {
      navigate(0); // Reîmprospătează pagina
    } else {
      navigate("/"); // Navigăm la pagina de acasă
    }
  };

  const handleAdminDashboardClick = () => {
    navigate("/admin"); // Navigăm la Admin Dashboard
  };

  const handleLogoutClick = async () => {
    try {
      await logout(); // Executăm funcția de logout
      navigate("/login"); // Redirecționăm la pagina de login
    } catch (error) {
      console.error("Eroare la deconectare:", error);
    }
  };

  console.log("Stare de autentificare în NavBar:", currentUser);

  return (
    <div className={styles.navbar}>
      <div className={styles.navButtonsContainer}>
        {/* Butonul Acasă este vizibil întotdeauna */}
        <button onClick={handleHomeClick} className={styles.navButton}>
          Acasă
        </button>

        {/* Afișează Admin Dashboard dacă utilizatorul este autentificat */}
        {currentUser && location.pathname !== "/admin" && (
          <button onClick={handleAdminDashboardClick} className={styles.navButton}>
            Admin Dashboard
          </button>
        )}

        {/* Afișează Admin Login doar dacă utilizatorul NU este autentificat */}
        {!currentUser && (
          <button onClick={handleLoginClick} className={styles.navButton}>
            Admin Login
          </button>
        )}

        {/* Afișează Logout doar dacă utilizatorul ESTE autentificat */}
        {currentUser && (
          <button onClick={handleLogoutClick} className={styles.navButton}>
            Logout
          </button>
        )}
      </div>
    </div>
  );
}

export default NavBar;
