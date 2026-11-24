import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import styles from "./NavBar.module.css";

function NavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLoginClick = () => {
    navigate("/login");
    setIsMenuOpen(false);
  };

  const handleHomeClick = () => {
    if (location.pathname === "/") {
      // fără reîncărcare: profesorul nu pierde ce a scris în formular
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      navigate("/");
    }
    setIsMenuOpen(false);
  };

  const handleAdminDashboardClick = () => {
    // și de pe /admin (din Săli sau Repartizare) ne întoarce la panoul principal
    navigate("/admin", { state: { backToDashboard: Date.now() } });
    setIsMenuOpen(false);
  };

  const handleLogoutClick = async () => {
    try {
      await logout();
      navigate("/login");
      setIsMenuOpen(false);
    } catch (error) {
      console.error("Eroare la deconectare:", error);
    }
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <div className={styles.navbar}>
      {/* numele concursului: duce la pagina de start */}
      <button className={styles.brand} onClick={handleHomeClick} aria-label="Misterele Matematicii – pagina de start">
        <span className={styles.brandMark} aria-hidden="true">∑</span>
        <span className={styles.brandText}>
          Misterele <b>Matematicii</b>
        </span>
      </button>

      {/* Hamburger Icon - vizibil doar pe mobil */}
      <button className={styles.hamburger} onClick={toggleMenu} aria-label="Toggle menu">
        <span className={styles.hamburgerLine}></span>
        <span className={styles.hamburgerLine}></span>
        <span className={styles.hamburgerLine}></span>
      </button>

      {/* Overlay pentru închidere menu */}
      {isMenuOpen && <div className={styles.overlay} onClick={toggleMenu}></div>}

      {/* Container butoane - desktop inline, mobil dropdown */}
      <div className={`${styles.navButtonsContainer} ${isMenuOpen ? styles.open : ""}`}>
        <button onClick={handleHomeClick} className={styles.navButton}>
          Acasă
        </button>

        {currentUser && (
          <button onClick={handleAdminDashboardClick} className={styles.navButton}>
            Admin Dashboard
          </button>
        )}

        {!currentUser && (
          <button onClick={handleLoginClick} className={styles.navButton}>
            Admin Login
          </button>
        )}

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
