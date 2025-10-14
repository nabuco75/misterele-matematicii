import React, { useState, useEffect } from "react";
import emailjs from "emailjs-com";
import { db } from "./firebase";
import { collection, addDoc, getDocs, query, where } from "firebase/firestore";
import styles from "./ClassForm.module.css";

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

  // nou: contorizare locuri ocupate / ciclu (informativ)
  const [countByClass, setCountByClass] = useState({
    "a IV-a": 0,
    "a V-a": 0,
    "a VI-a": 0,
    "a VII-a": 0,
  });

  const [errors, setErrors] = useState({
    email: "",
    telefon: "",
    profesorIndrumator: "",
  });

  const [showConfirmation, setShowConfirmation] = useState(false);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^\d{10}$/;

  // helper: numără câți elevi sunt deja înscriși pentru (schoolId, className)
  const fetchCountForClass = async (className) => {
    const q = query(collection(db, "registration"), where("schoolId", "==", schoolId), where("class", "==", className));
    const snap = await getDocs(q);

    let total = 0;
    snap.forEach((doc) => {
      const data = doc.data();
      const arr = Array.isArray(data?.students) ? data.students : [];
      total += arr.length;
    });
    return total; // numărul total de elevi deja înscriși la acel ciclu
  };

  // informativ: încarcă numărul curent pe fiecare ciclu când se schimbă școala
  useEffect(() => {
    let isMounted = true;
    const loadCounts = async () => {
      if (!schoolId) return;
      const classes = Object.keys(studentsByClass);
      const results = {};
      for (const c of classes) {
        results[c] = await fetchCountForClass(c);
      }
      if (isMounted) setCountByClass(results);
    };
    loadCounts();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const handleChange = (className, index, value) => {
    const newClassStudents = [...studentsByClass[className]];
    newClassStudents[index] = value;
    setStudentsByClass((prev) => ({
      ...prev,
      [className]: newClassStudents,
    }));
  };

  const handleBlur = (field) => {
    let errorMessage = "";
    if (field === "email") {
      errorMessage = emailRegex.test(email) ? "" : "Adresa de email nu este validă!";
      setErrors((prev) => ({ ...prev, email: errorMessage }));
    } else if (field === "telefon") {
      errorMessage = phoneRegex.test(telefon) ? "" : "Numărul de telefon trebuie să conțină 10 cifre!";
      setErrors((prev) => ({ ...prev, telefon: errorMessage }));
    } else if (field === "profesorIndrumator") {
      errorMessage = profesorIndrumator.trim() !== "" ? "" : "Numele profesorului îndrumător este necesar!";
      setErrors((prev) => ({ ...prev, profesorIndrumator: errorMessage }));
    }
  };

  // verifică limita 5/ciclu înainte de a deschide confirmarea
  const handleInscrieClick = async (e) => {
    e.preventDefault();

    setMessage({ type: "", content: "" });

    if (!emailRegex.test(email) || !phoneRegex.test(telefon) || profesorIndrumator.trim() === "") {
      setMessage({ type: "error", content: "Vă rugăm să completați corect toate câmpurile!" });
      return;
    }

    if (!schoolId) {
      setMessage({ type: "error", content: "Selectați mai întâi școala." });
      return;
    }

    // Re-verificare proaspătă din Firestore ca să fie actualizat în momentul submit-ului
    const classes = Object.keys(studentsByClass);

    for (const className of classes) {
      const proposed = studentsByClass[className].filter((s) => s && s.trim() !== "");
      if (proposed.length === 0) continue; // nimic de înscris pe acest ciclu

      const current = await fetchCountForClass(className);
      if (current >= 5) {
        setMessage({
          type: "error",
          content: `Școala dvs. a atins deja limita de 5 elevi pentru ${className}. În caz de neclarități, vă rugăm să ne contactați la adresa contact@scoala5vaslui.ro sau să luați legătura cu unul dintre organizatori, prof. Mirela Obreja, la numărul de telefon 0766 630 518.`,
        });
        return;
      }
      if (current + proposed.length > 5) {
        const remaining = 5 - current;
        setMessage({
          type: "error",
          content: `Pentru ${className} mai sunt disponibile doar ${remaining} loc(uri). Ajustați lista.`,
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

      // INSCRIERE pe fiecare ciclu (doar unde ai elevi completați)
      for (const className of classes) {
        const filteredStudents = studentsByClass[className].map((s) => s?.trim()).filter(Boolean);

        if (filteredStudents.length === 0) continue;

        await addDoc(collection(db, "registration"), {
          class: className,
          school: selectedSchool,
          schoolId: schoolId,
          students: filteredStudents,
          profesorIndrumatorEmail: profesorIndrumator,
          telefon: telefon,
        });
      }

      // Email de confirmare
      const rows = classes
        .map((className) => {
          const arr = studentsByClass[className].map((s) => s?.trim()).filter(Boolean);
          if (arr.length === 0) return "";
          const li = arr.map((s) => `<li>${s}</li>`).join("");
          return `<tr><td>${className}</td><td><ul>${li}</ul></td></tr>`;
        })
        .filter(Boolean)
        .join("");

      const emailContent = "<table border='1' cellpadding='5' cellspacing='0'><thead><tr><th>Clasa</th><th>Elevi</th></tr></thead><tbody>" + rows + "</tbody></table>";

      const templateParams = {
        to_name: email,
        from_name: "Școala Stefan cel Mare Vaslui",
        students: emailContent,
        reply_to: email,
      };

      const response = await emailjs.send("service_e2pf9w6", "template_st5cb5c", templateParams, "IpIiJlmFDSQJ6WnbS");

      if (response.status === 200) {
        setMessage({
          type: "success",
          content: "Elevii au fost înscriși și emailul a fost trimis cu succes!",
        });
        // reset form
        setStudentsByClass({
          "a IV-a": Array(5).fill(""),
          "a V-a": Array(5).fill(""),
          "a VI-a": Array(5).fill(""),
          "a VII-a": Array(5).fill(""),
        });
        setEmail("");
        setProfesorIndrumator("");
        setTelefon("");
        setErrors({ email: "", telefon: "", profesorIndrumator: "" });

        // refresh informativ countByClass
        const refreshed = {};
        for (const c of Object.keys(countByClass)) {
          refreshed[c] = await fetchCountForClass(c);
        }
        setCountByClass(refreshed);
      } else {
        setMessage({
          type: "error",
          content: "Eroare la trimiterea emailului. Încercați din nou.",
        });
      }
    } catch (error) {
      console.error("Eroare la înscriere:", error);
      setMessage({
        type: "error",
        content: "A apărut o eroare la înscriere. Încercați din nou.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setShowConfirmation(false);
  };

  return (
    <div className={styles["form-container"]}>
      <h2>Înscriere elevi</h2>

      {/* Informativ: locuri ocupate/total pe ciclu */}
      <div className={styles["quota-hint"]}>
        <strong>Stare locuri (max 5/ciclu):</strong>{" "}
        {["a IV-a", "a V-a", "a VI-a", "a VII-a"].map((c, i) => (
          <span key={c}>
            {c}: {countByClass[c]}/5{i < 3 ? " • " : ""}
          </span>
        ))}
      </div>

      <form onSubmit={handleInscrieClick} className={styles["form-group"]}>
        <div className={styles["class-groups"]}>
          {Object.keys(studentsByClass).map((className) => (
            <div className={styles["class-group"]} key={className}>
              <h3>{className}</h3>
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
              <div className={styles["quota-inline"]}>Ocupate: {countByClass[className]}/5</div>
            </div>
          ))}
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

        {message.content && <div className={`${styles.message} ${message.type === "success" ? styles.success : styles.error}`}>{message.content}</div>}
      </form>

      {showConfirmation && (
        <div className={styles.confirmationModal}>
          <p>Confirmi înscrierea elevilor? (Limita este 5 elevi/școală pentru fiecare ciclu.)</p>
          <button onClick={handleConfirmInscriere} className={styles.confirmButton}>
            DA
          </button>
          <button onClick={handleCancel} className={styles.cancelButton}>
            Anulează
          </button>
        </div>
      )}
    </div>
  );
}

export default ClassForm;
