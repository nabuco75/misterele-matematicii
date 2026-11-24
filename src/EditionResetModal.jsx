// Fereastra „Pregătește ediția nouă”: copie completă obligatorie, apoi golire confirmată prin cuvânt.
import React, { useEffect, useRef, useState } from "react";
import { checkBeforeReset, countsOf, downloadBackup, readEverything, resetEdition } from "./editionReset";
import styles from "./EditionResetModal.module.css";

const WORD = "EDITIE NOUA";

export default function EditionResetModal({ onClose, onDone }) {
  const [backup, setBackup] = useState(null); // { elevi, at, excelOk, counts }
  const [haveFiles, setHaveFiles] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const firstBtn = useRef(null);

  // focusul intră o singură dată în fereastră; Escape închide (nu în timpul lucrului)
  const busyRef = useRef(false);
  busyRef.current = busy;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    firstBtn.current?.focus();
    const onKey = (e) => e.key === "Escape" && !busyRef.current && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const doBackup = async () => {
    setBusy(true);
    setError("");
    setStep("Se citesc toate datele...");
    try {
      const data = await readEverything();
      const r = downloadBackup(data);
      setBackup({ ...r, counts: countsOf(data), at: new Date().toLocaleTimeString("ro-RO") });
      setHaveFiles(false);
      setStep("");
    } catch (err) {
      console.error("Copia nu a putut fi făcută:", err);
      setError("Copia nu a putut fi făcută. Verificați conexiunea și încercați din nou. Nu s-a șters nimic.");
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    setBusy(true);
    setError("");
    try {
      setStep("Se verifică dacă înscrierile sunt închise și dacă datele s-au schimbat de la copie...");
      const problem = await checkBeforeReset(backup.counts);
      if (problem) {
        setError(problem);
        setStep("");
        return;
      }
      const done = await resetEdition(setStep);
      setResult(done);
      setStep("");
      onDone?.();
    } catch (err) {
      console.error("Golirea s-a oprit:", err);
      setError(
        "Golirea s-a oprit la mijloc (probabil conexiunea). Apăsați din nou „Golește datele”: se șterge doar ce a rămas."
      );
    } finally {
      setBusy(false);
    }
  };

  const canReset = backup && haveFiles && typed.trim().toUpperCase() === WORD && !busy;

  return (
    <div className={styles.overlay} onClick={() => !busy && onClose()}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edition-reset-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="edition-reset-title" className={styles.title}>
          🗓️ Pregătește ediția nouă
        </h2>

        {result ? (
          <>
            <p className={styles.ok}>
              ✅ Gata. S-au șters {result.registration} înscrieri, {result.codes} coduri și {result.grades} note;
              repartizarea pe săli a fost golită.
            </p>
            <p className={styles.note}>
              Au rămas: școlile, sălile, antetul și starea înscrierilor. Schimbați acum ediția și data (la Tipărire ›
              Antet) și, când e cazul, deschideți înscrierile.
            </p>
            <div className={styles.buttons}>
              <button className={styles.primary} onClick={onClose}>
                Închide
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={styles.note}>
              Se șterg <b>toate înscrierile, codurile de anonimizare, notele și repartizarea pe săli</b>. Rămân școlile,
              sălile, antetul și sumele premiilor. Operația nu se poate anula — de aceea copia e obligatorie.
            </p>
            <p className={styles.warnBox}>
              ⚠️ Înainte: <b>închideți înscrierile</b> și <b>închideți paginile Notare / Repartizare</b> deschise pe alte
              calculatoare (altfel pot rescrie date vechi după golire).
            </p>

            <ol className={styles.steps}>
              <li className={backup ? styles.done : ""}>
                <b>Descărcați copia completă</b> (un Excel de citit și un fișier JSON cu absolut tot).
                <div>
                  <button ref={firstBtn} className={styles.secondary} onClick={doBackup} disabled={busy}>
                    {backup ? "📥 Descarcă din nou copia" : "📥 Descarcă copia completă"}
                  </button>
                  {backup && (
                    <span className={styles.check}>
                      ✅ copie descărcată la {backup.at} ({backup.elevi} elevi)
                      {!backup.excelOk && " — doar JSON-ul (Excelul nu s-a putut genera)"}
                    </span>
                  )}
                </div>
                {backup && (
                  <label className={styles.confirmFiles}>
                    <input type="checkbox" checked={haveFiles} onChange={(e) => setHaveFiles(e.target.checked)} />
                    Am verificat în folderul Descărcări că am fișierul <b>.json</b>
                    {backup.excelOk && (
                      <>
                        {" "}
                        și fișierul <b>.xlsx</b>
                      </>
                    )}{" "}
                    (browserul poate cere permisiunea pentru mai multe descărcări). Conțin date personale: păstrați-le
                    în siguranță.
                  </label>
                )}
              </li>
              <li className={canReset ? styles.done : ""}>
                <label htmlFor="edition-word">
                  Scrieți <b>{WORD}</b> ca să confirmați
                </label>
                <input
                  id="edition-word"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  disabled={!backup || !haveFiles || busy}
                  autoComplete="off"
                  placeholder={backup && haveFiles ? WORD : "întâi descărcați și verificați copia"}
                />
              </li>
            </ol>

            {step && (
              <p className={styles.step} role="status">
                ⏳ {step}
              </p>
            )}
            {error && (
              <p className={styles.error} role="alert">
                ⚠️ {error}
              </p>
            )}

            <div className={styles.buttons}>
              <button className={styles.secondary} onClick={onClose} disabled={busy}>
                Anulează
              </button>
              <button className={styles.danger} onClick={doReset} disabled={!canReset}>
                🗑️ Golește datele
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
