import React from "react";
import { useNavigate } from "react-router-dom";
import styles from "./NavBar.module.css";

function NavBar() {
  const navigate = useNavigate();

  const handleLoginClick = () => {
    navigate("/login");
  };

  const handleHomeClick = () => {
    console.log("Butonul Acasă a fost apăsat");
    window.location.href = "/"; // Forțăm reîncărcarea completă a paginii pentru a naviga la "/"
  };

  return (
    <div className={styles.navbar}>
      <div className={styles.navButtonsContainer}>
        <button onClick={handleHomeClick} className={styles.navButton}>
          Acasă
        </button>
        <button onClick={handleLoginClick} className={styles.navButton}>
          Admin Login
        </button>
      </div>
    </div>
  );
}

export default NavBar;
