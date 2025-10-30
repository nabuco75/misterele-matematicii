import React, { useState, useEffect } from "react";
import emailjs from "emailjs-com";
import { db } from "./firebase";
import { collection, addDoc, getDocs, query, where, onSnapshot } from "firebase/firestore";
import styles from "./ClassForm.module.css";

const CLASS_COLORS = {
  "a IV-a": { from: "#7c4dff", to: "#3f8efc" },   // albastru-violet
  "a V-a":  { from: "#34d399", to: "#059669" },   // verde
  "a VI-a": { from: "#fbbf24", to: "#f59e0b" },   // portocaliu
  "a VII-a":{ from: "#a78bfa", to: "#7c3aed" },   // mov
};

// culoarea barei în funcție de procent
const barColor = (pct) => pct < 60 ? "#22c55e" : pct < 100 ? "#f59e0b" : "#ef4444";

function ClassForm({ selectedSchool, schoolId }) {
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

  const fetchCountForClass = async (className) => {
    const qReg = query(collection(db, "registration"),
      where("schoolId", "==", schoolId),
      where("class", "==", className)
    );
    const snap = await getDocs(qReg);
    let total = 0;
    snap.forEach((doc) => {
      const arr = Array.isArray(doc.data()?.students) ? doc.data().students : [];
      total += arr.length;
    });
    return total;
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

    const classes = Object.keys(studentsByClass);
    for (const className of classes) {
      const proposed = studentsByClass[className].map((s) => s?.trim()).filter(Boolean);
      if (!proposed.length) continue;

      const current = await fetchCountForClass(className);
      if (current >= 5) {
        setMessage({
          type: "error",
          content: `Școala dvs. a atins deja limita de 5 elevi pentru ${className}. În caz de neclarități, contact@scoala5vaslui.ro`,
        });
        return;
      }
      if (current + proposed.length > 5) {
        setMessage({
          type: "error",
          content: `Pentru ${className} mai sunt disponibile doar ${5 - current} loc(uri). Ajustați lista.`,
        });
        return;
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
          school: selectedSchool,
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
        setMessage({ type: "success", content: "Elevii au fost înscriși și emailul a fost trimis cu succes!" });
        setStudentsByClass({ "a IV-a": Array(5).fill(""), "a V-a": Array(5).fill(""), "a VI-a": Array(5).fill(""), "a VII-a": Array(5).fill("") });
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

  return (
    <div className={styles["form-container"]}>
      <h2>Înscriere elevi</h2>

      {/* BOARD STATISTICI – culori distincte per clasă */}
      <div className={styles.statsBoard}>
        {Object.keys(studentsByClass).map((c) => {
          const used = countByClass[c];
          const pending = localProposedCount(c);
          const left = Math.max(0, 5 - used - pending);
          const g = CLASS_COLORS[c];
          return (
            <div
              key={c}
              className={styles.statChip}
              style={{ "--chip-from": g.from, "--chip-to": g.to }}
            >
              <div className={styles.statTitle}>{c}</div>
              <div className={styles.statRow}>
                <span className={styles.statNum}>{used}</span>
                <span className={styles.statSlash}>/5</span>
              </div>
              <div className={styles.statMeta}>
                în curs: <strong>{pending}</strong> • rămase: <strong>{left}</strong>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleInscrieClick} className={styles["form-group"]}>
        <div className={styles["class-groups"]}>
          {Object.keys(studentsByClass).map((className) => {
            const used = countByClass[className];
            const pending = localProposedCount(className);
            const total = Math.min(5, used + pending);
            const pct = Math.round((total / 5) * 100);
            return (
              <div className={styles["class-group"]} key={className}>
                {/* header card: badge + progress bar dinamic */}
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

                {studentsByClass[className].map((student, index) => (
                  <input
                    key={index}
                    type="text"
                    placeholder={`Nume Elev ${index + 1}`}
                    value={student}
                    onChange={(e) => handleChange(className, index, e.target.value)}
                    className={styles["input-field"]}
                  />
                ))}

                <div className={styles["quota-inline"]}>
                  Ocupate: {used}/5 &nbsp;|&nbsp; în curs: {pending} &nbsp;|&nbsp; rămase: {Math.max(0, 5 - used - pending)}
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
            <p>Confirmi înscrierea elevilor? (Limita este 5 elevi/școală pentru fiecare ciclu.)</p>
            <button onClick={handleConfirmInscriere} className={styles.confirmButton}>DA</button>
            <button onClick={handleCancel} className={styles.cancelButton}>Anulează</button>
          </div>
        </>
      )}
    </div>
  );
}

export default ClassForm;
