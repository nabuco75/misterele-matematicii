import React, { useState, useEffect } from "react";
import emailjs from "emailjs-com";
import { db } from "./firebase";
import { collection, addDoc, getDocs, query, where, onSnapshot } from "firebase/firestore";
import styles from "./ClassForm.module.css";

const CLASS_COLORS = {
  "a IV-a": { from: "#7c4dff", to: "#3f8efc" },
  "a V-a":  { from: "#34d399", to: "#059669" },
  "a VI-a": { from: "#fbbf24", to: "#f59e0b" },
  "a VII-a":{ from: "#a78bfa", to: "#7c3aed" },
};

// === IDENTIFICARE ȘCOLI VIP (FĂRĂ LIMITĂ) ===
const isVipSchool = (schoolName) => {
  if (!schoolName) return false;
  
  // ✅ Normalizare corectă pentru diacritice românești
  const normalize = (str) => {
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  };
  
  const target = normalize(schoolName);
  
  return (
    (target.includes("stefancelmare") && target.includes("vaslui")) ||
    (target.includes("georgetutoveanu") && target.includes("barlad")) ||
    (target.includes("constantinparfene") && target.includes("vaslui"))
  );
};

const barColor = (pct) => pct < 60 ? "#22c55e" : pct < 100 ? "#f59e0b" : "#ef4444";

function ClassForm({ selectedSchool }) {
  const schoolId = selectedSchool?.id || "";
  const schoolName = selectedSchool?.name || "";
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [authError, setAuthError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const MAX_ATTEMPTS = 3;
  const CORRECT_CODE = "MMVSSC5";

  const isVip = isVipSchool(schoolName);
  
  const [studentsByClass, setStudentsByClass] = useState({
    "a IV-a": Array(5).fill(""),
    "a V-a": Array(5).fill(""),
    "a VI-a": Array(5).fill(""),
    "a VII-a": Array(5).fill(""),
  });

  const [email, setEmail] = useState("");
  const [profesorIndrumator, setProfesorIndrumator] = useState("");
  const [telefon, setTelefon] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", content: "" });

  const [countByClass, setCountByClass] = useState({
    "a IV-a": 0, "a V-a": 0, "a VI-a": 0, "a VII-a": 0,
  });

  const [errors, setErrors] = useState({ email: "", telefon: "", profesorIndrumator: "" });
  const [showConfirmation, setShowConfirmation] = useState(false);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^\d{10}$/;

  const handleAuthSubmit = (e) => {
    e.preventDefault();
    
    if (isBlocked) return;
    
    if (accessCode.trim() === CORRECT_CODE) {
      setIsAuthenticated(true);
      setAuthError("");
      setAccessCode("");
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      
      if (newAttempts >= MAX_ATTEMPTS) {
        setIsBlocked(true);
        setAuthError("🚫 Prea multe încercări greșite! Pagina se va reîncărca în 5 secunde...");
        setTimeout(() => window.location.reload(), 5000);
      } else {
        setAuthError(`❌ Cod incorect! Încercări rămase: ${MAX_ATTEMPTS - newAttempts}`);
        setAccessCode("");
      }
    }
  };

  useEffect(() => {
    if (!schoolId) return;
    const classes = Object.keys(studentsByClass);
    const unsubs = classes.map((c) => {
      const qReg = query(collection(db, "registration"),
        where("schoolId", "==", schoolId),
        where("class", "==", c)
      );
      return onSnapshot(qReg, (snap) => {
        let total = 0;
        snap.forEach((doc) => {
          const arr = Array.isArray(doc.data()?.students) ? doc.data().students : [];
          total += arr.length;
        });
        setCountByClass((prev) => ({ ...prev, [c]: total }));
      });
    });
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const handleChange = (className, index, value) => {
    const next = [...studentsByClass[className]];
    next[index] = value;
    setStudentsByClass((prev) => ({ ...prev, [className]: next }));
  };

  const handleBlur = (field) => {
    if (field === "email")
      setErrors((p) => ({ ...p, email: emailRegex.test(email) ? "" : "Adresa de email nu este validă!" }));
    if (field === "telefon")
      setErrors((p) => ({ ...p, telefon: phoneRegex.test(telefon) ? "" : "Numărul de telefon trebuie să conțină 10 cifre!" }));
    if (field === "profesorIndrumator")
      setErrors((p) => ({ ...p, profesorIndrumator: profesorIndrumator.trim() ? "" : "Numele profesorului îndrumător este necesar!" }));
  };

  const localProposedCount = (className) =>
    studentsByClass[className].map((s) => s?.trim()).filter(Boolean).length;

  const handleInscrieClick = async (e) => {
    e.preventDefault();
    setMessage({ type: "", content: "" });

    if (!emailRegex.test(email) || !phoneRegex.test(telefon) || !profesorIndrumator.trim()) {
      setMessage({ type: "error", content: "Vă rugăm să completați corect toate câmpurile!" });
      return;
    }
    if (!schoolId) {
      setMessage({ type: "error", content: "Selectați mai întâi școala." });
      return;
    }

    if (!isVip) {
      const classes = Object.keys(studentsByClass);
      for (const className of classes) {
        const proposed = studentsByClass[className].filter(s => s?.trim()).length;
        if (!proposed) continue;
        
        const currentInDb = countByClass[className];

        if (currentInDb >= 5) {
          setMessage({
            type: "error",
            content: `Școala dvs. a atins deja limita de 5 elevi pentru ${className}. În caz de neclarități, contact@scoala5vaslui.ro`,
          });
          return;
        }

        if (currentInDb + proposed > 5) {
          setMessage({
            type: "error",
            content: `Pentru ${className} mai sunt disponibile doar ${5 - currentInDb} loc(uri). Ajustați lista.`,
          });
          return;
        }
      }
    }

    setShowConfirmation(true);
  };

  const handleConfirmInscriere = async () => {
    setShowConfirmation(false);
    setLoading(true);
    setMessage({ type: "", content: "" });

    try {
      const classes = Object.keys(studentsByClass);

      for (const className of classes) {
        const filtered = studentsByClass[className].map((s) => s?.trim()).filter(Boolean);
        if (!filtered.length) continue;

        await addDoc(collection(db, "registration"), {
          class: className,
          school: schoolName,
          schoolId,
          students: filtered,
          profesorIndrumatorEmail: profesorIndrumator,
          telefon,
          createdAt: Date.now(),
        });
      }

      const rows = classes.map((c) => {
        const arr = studentsByClass[c].map((s) => s?.trim()).filter(Boolean);
        if (!arr.length) return "";
        const li = arr.map((s) => `<li>${s}</li>`).join("");
        return `<tr><td>${c}</td><td><ul>${li}</ul></td></tr>`;
      }).filter(Boolean).join("");

      const emailContent =
        "<table border='1' cellpadding='5' cellspacing='0'><thead><tr><th>Clasa</th><th>Elevi</th></tr></thead><tbody>" +
        rows + "</tbody></table>";

      const response = await emailjs.send(
        "service_e2pf9w6", "template_st5cb5c",
        { to_name: email, from_name: "Școala Stefan cel Mare Vaslui", students: emailContent, reply_to: email },
        "IpIiJlmFDSQJ6WnbS"
      );

      if (response.status === 200) {
        const successMsg = isVip 
          ? "✅ Elevii au fost înscriși cu succes! Puteți adăuga alți elevi completând din nou formularul."
          : "Elevii au fost înscriși și emailul a fost trimis cu succes!";
        
        setMessage({ type: "success", content: successMsg });
        setStudentsByClass({ 
          "a IV-a": Array(5).fill(""), 
          "a V-a": Array(5).fill(""), 
          "a VI-a": Array(5).fill(""), 
          "a VII-a": Array(5).fill("") 
        });
        setEmail(""); setProfesorIndrumator(""); setTelefon("");
        setErrors({ email: "", telefon: "", profesorIndrumator: "" });
      } else {
        setMessage({ type: "error", content: "Eroare la trimiterea emailului. Încercați din nou." });
      }
    } catch (err) {
      console.error("Eroare la înscriere:", err);
      setMessage({ type: "error", content: "A apărut o eroare la înscriere. Încercați din nou." });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => setShowConfirmation(false);

  if (!isAuthenticated) {
    return (
      <>
        <div className={styles.authOverlay}>
          <div className={styles.authModal}>
            <div className={styles.authHeader}>
              <div className={styles.authIcon}>🔐</div>
              <h2 className={styles.authTitle}>Acces Restricționat</h2>
              <p className={styles.authSubtitle}>
                Doar profesorii îndrumători pot înscrie elevi la concurs
              </p>
            </div>

            <form onSubmit={handleAuthSubmit} className={styles.authForm}>
              <div className={styles.authInputGroup}>
                <label htmlFor="accessCode" className={styles.authLabel}>
                  Cod de acces profesor
                </label>
                <input
                  id="accessCode"
                  type="text"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="Introduceți codul de acces"
                  className={`${styles.authInput} ${authError ? styles.authInputError : ""}`}
                  disabled={isBlocked}
                  autoFocus
                />
                
                {authError && (
                  <div className={styles.authError}>
                    {authError}
                  </div>
                )}
              </div>

              <button 
                type="submit" 
                className={styles.authButton}
                disabled={isBlocked || !accessCode.trim()}
              >
                {isBlocked ? "Blocat..." : "Validează Codul"}
              </button>

              <div className={styles.authFooter}>
                <p>
                  <strong>Nu aveți cod?</strong> Contactați coordonatorul la<br />
                  <a href="mailto:contact@scoala5vaslui.ro">contact@scoala5vaslui.ro</a>
                </p>
              </div>

              <div className={styles.authAttempts}>
                {[...Array(MAX_ATTEMPTS)].map((_, i) => (
                  <span 
                    key={i} 
                    className={`${styles.attemptDot} ${i < attempts ? styles.attemptUsed : ""}`}
                  />
                ))}
              </div>
            </form>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className={styles["form-container"]}>
      <h2>Înscriere elevi</h2>
      
      {isVip && (
        <div className={styles.infoMessage}>
          ✨ <strong>Status Special:</strong> Această școală poate înscrie mai mulți elevi. 
          După ce completați și trimiteți primii 5 elevi, formularul se va goli automat și puteți adăuga următoarea serie.
        </div>
      )}

      <form onSubmit={handleInscrieClick} className={styles["form-group"]}>
        <div className={styles["class-groups"]}>
          {Object.keys(studentsByClass).map((className) => {
            const used = countByClass[className];
            const pending = localProposedCount(className);
            const g = CLASS_COLORS[className];

            let left, total, pct;
            
            if (isVip) {
              left = "∞";
              total = used + pending;
              pct = 0;
            } else {
              left = Math.max(0, 5 - used - pending);
              total = Math.min(5, used + pending);
              pct = Math.round((total / 5) * 100);
            }

            return (
              <div className={styles["class-group"]} key={className}>
                <div
                  className={styles.statChip}
                  style={{ "--chip-from": g.from, "--chip-to": g.to }}
                >
                  <div className={styles.statTitle}>{className}</div>
                  <div className={styles.statRow}>
                    <span className={styles.statNum}>{used}</span>
                    <span className={styles.statSlash}>
                      {isVip ? " total școală" : "/5"}
                    </span>
                  </div>
                  <div className={styles.statMeta}>
                    în curs: <strong>{pending}</strong> • rămase: <strong>{left}</strong>
                  </div>
                </div>

                {!isVip && (
                  <div className={styles.cardHeader}>
                    <div className={styles.classBadge}>{className}</div>
                    <div className={styles.progressWrap} aria-label={`Ocupate + în curs: ${total}/5`}>
                      <div
                        className={styles.progressBar}
                        style={{ width: `${pct}%`, background: barColor(pct) }}
                      />
                    </div>
                    <div className={styles.progressText}>{total}/5</div>
                  </div>
                )}

                {studentsByClass[className].map((student, index) => (
                  <input
                    key={index}
                    type="text"
                    placeholder={`Nume Elev ${index + 1}`}
                    value={student}
                    onChange={(e) => handleChange(className, index, e.target.value)}
                    className={styles["input-field"]}
                    disabled={!isVip && used >= 5}
                  />
                ))}

                <div className={styles["quota-inline"]}>
                  {isVip ? (
                    <>Total școală: {used} | În curs acum: {pending}</>
                  ) : (
                    <>
                      Ocupate: {used}/5 | în curs: {pending} | rămase: {left}
                      {used >= 5 && <span style={{color: '#ef4444', marginLeft: '10px'}}>● Limită atinsă</span>}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles["email-container"]}>
          <div className={styles["guide-container"]}>
            <div className={styles["input-group"]}>
              <input
                type="text"
                placeholder="Profesor îndrumător"
                value={profesorIndrumator}
                onChange={(e) => setProfesorIndrumator(e.target.value)}
                onBlur={() => handleBlur("profesorIndrumator")}
                className={`${styles["input-field"]} ${errors.profesorIndrumator ? styles.invalid : ""}`}
              />
              {errors.profesorIndrumator && <div className={styles["error-message"]}>{errors.profesorIndrumator}</div>}
            </div>

            <div className={styles["input-group"]}>
              <input
                type="email"
                placeholder="E-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => handleBlur("email")}
                className={`${styles["input-field"]} ${errors.email ? styles.invalid : ""}`}
                required
              />
              {errors.email && <div className={styles["error-message"]}>{errors.email}</div>}
            </div>

            <div className={styles["input-group"]}>
              <input
                type="tel"
                placeholder="Telefon (10 cifre)"
                value={telefon}
                onChange={(e) => setTelefon(e.target.value)}
                onBlur={() => handleBlur("telefon")}
                className={`${styles["input-field"]} ${errors.telefon ? styles.invalid : ""}`}
              />
              {errors.telefon && <div className={styles["error-message"]}>{errors.telefon}</div>}
            </div>
          </div>
        </div>

        <button type="submit" className={styles["submit-button"]} disabled={loading}>
          {loading ? "Înscriere în curs..." : "Înscrie Elevi"}
        </button>

        {message.content && (
          <div className={`${styles.message} ${message.type === "success" ? styles.success : styles.error}`}>
            {message.content}
          </div>
        )}
      </form>

      {showConfirmation && (
        <>
          <div className={styles.modalOverlay} />
          <div className={styles.confirmationModal}>
            <p>
              Confirmi înscrierea elevilor? 
              {!isVip && " (Limita este 5 elevi/școală pentru fiecare ciclu.)"}
            </p>
            <button onClick={handleConfirmInscriere} className={styles.confirmButton}>DA</button>
            <button onClick={handleCancel} className={styles.cancelButton}>Anulează</button>
          </div>
        </>
      )}
    </div>
  );
}

export default ClassForm;