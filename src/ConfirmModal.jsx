import React, { useEffect, useRef, useState } from "react";
import styles from "./ConfirmModal.module.css";

// Confirmare pentru operații importante (ștergeri). Cât rulează operația, butoanele sunt blocate:
// un dublu-clic pe „Confirmă” nu mai pornește operația a doua oară.
function ConfirmModal({ isOpen, title, message, onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef(null);
  const busyRef = useRef(false);
  busyRef.current = busy;
  const cancelFn = useRef(onCancel);
  cancelFn.current = onCancel;

  useEffect(() => {
    if (!isOpen) return undefined;
    setBusy(false);
    cancelRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && !busyRef.current && cancelFn.current?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const confirm = async () => {
    if (busyRef.current) return;
    setBusy(true);
    busyRef.current = true;
    try {
      await onConfirm?.();
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };

  return (
    <div className={styles.overlay} onClick={() => !busy && onCancel?.()}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-modal-title" className={styles.title}>
          {title}
        </h2>
        <p className={styles.message}>{message}</p>
        <div className={styles.buttons}>
          <button ref={cancelRef} onClick={onCancel} className={styles.cancelButton} disabled={busy}>
            Anulează
          </button>
          <button onClick={confirm} className={styles.confirmButton} disabled={busy}>
            {busy ? "Se lucrează..." : "Confirmă"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
