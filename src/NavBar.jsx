import React from "react";
import { useNavigate } from "react-router-dom";
import styles from "./NavBar.module.css"; // Asigură-te că stilurile sunt importate corect

function NavBar() {
  const navigate = useNavigate();

  const handleLoginClick = () => {
    navigate("/login"); // Redirecționează utilizatorul către pagina de login
  };

  const handleHomeClick = () => {
    navigate("/"); // Redirecționează utilizatorul către pagina de acasă (Landing)
  };

  return (
    <div className={styles.navbar}>
      <div className={styles.navButtonsContainer}>
        {" "}
        {/* Container pentru butoane */}
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
