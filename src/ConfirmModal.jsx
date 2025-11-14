import React from "react";
import styles from "./ConfirmModal.module.css";

function ConfirmModal({ isOpen, title, message, onConfirm, onCancel }) {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.message}>{message}</p>
        <div className={styles.buttons}>
          <button onClick={onCancel} className={styles.cancelButton}>
            Anulează
          </button>
          <button onClick={onConfirm} className={styles.confirmButton}>
            Confirmă
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;