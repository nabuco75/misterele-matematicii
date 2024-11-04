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
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [errors, setErrors] = useState({ email: "", telefon: "", profesorIndrumator: "" });
  const [showConfirmation, setShowConfirmation] = useState(false); // Nou state pentru modalul de confirmare

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^\d{10}$/;

  useEffect(() => {
    if (schoolId) {
      const checkIfAlreadyRegistered = async () => {
        const q = query(collection(db, "registration"), where("schoolId", "==", schoolId));
        const querySnapshot = await getDocs(q);
        setAlreadyRegistered(!querySnapshot.empty);
      };
      checkIfAlreadyRegistered();
    }
  }, [schoolId]);

  const handleChange = (className, index, value) => {
    const newClassStudents = [...studentsByClass[className]];
    newClassStudents[index] = value;
    setStudentsByClass((prevState) => ({
      ...prevState,
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

  const handleInscrieClick = (e) => {
    e.preventDefault();
    if (!emailRegex.test(email) || !phoneRegex.test(telefon) || profesorIndrumator.trim() === "") {
      setMessage({ type: "error", content: "Vă rugăm să completați corect toate câmpurile!" });
      return;
    }
    if (alreadyRegistered) {
      setMessage({ type: "error", content: "Ați înscris deja elevi de la această școală." });
      return;
    }
    setShowConfirmation(true); // Afișează modalul de confirmare
  };

  const handleConfirmInscriere = async () => {
    setShowConfirmation(false);
    setLoading(true);

    try {
      const classes = Object.keys(studentsByClass);
      for (const className of classes) {
        const filteredStudents = studentsByClass[className].filter((student) => student);
        if (filteredStudents.length > 0) {
          await addDoc(collection(db, "registration"), {
            class: className,
            school: selectedSchool,
            schoolId: schoolId,
            students: filteredStudents,
            profesorIndrumatorEmail: profesorIndrumator,
            telefon: telefon,
          });
        }
      }

      // Trimiterea emailului cu EmailJS
      let emailContent = "<table border='1' cellpadding='5' cellspacing='0'>";
      emailContent += "<thead><tr><th>Clasa</th><th>Elevi</th></tr></thead><tbody>";
      for (const className of classes) {
        const filteredStudents = studentsByClass[className].filter((student) => student);
        if (filteredStudents.length > 0) {
          emailContent += `<tr><td>${className}</td><td><ul>`;
          filteredStudents.forEach((student) => {
            emailContent += `<li>${student}</li>`;
          });
          emailContent += `</ul></td></tr>`;
        }
      }
      emailContent += "</tbody></table>";

      const templateParams = {
        to_name: email,
        from_name: "Școala Stefan cel Mare Vaslui",
        students: emailContent,
        reply_to: email,
      };

      const response = await emailjs.send("service_e2pf9w6", "template_st5cb5c", templateParams, "IpIiJlmFDSQJ6WnbS");

      if (response.status === 200) {
        setMessage({ type: "success", content: "Elevii au fost înscriși și emailul a fost trimis cu succes!" });
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
      } else {
        setMessage({ type: "error", content: "Eroare la trimiterea emailului. Încercați din nou." });
      }
    } catch (error) {
      console.error("Eroare la trimiterea emailului:", error);
      setMessage({ type: "error", content: "A apărut o eroare la trimiterea emailului." });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setShowConfirmation(false); // Anulează înscrierea
  };

  return (
    <div className={styles["form-container"]}>
      <h2>Înscriere elevi</h2>

      {alreadyRegistered && <div className={`${styles.message} ${styles.error}`}>Ați înscris deja elevi de la această școală.</div>}

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

        <button type="submit" className={styles["submit-button"]} disabled={loading || alreadyRegistered}>
          {loading ? "Înscriere în curs..." : "Înscrie Elevi"}
        </button>

        {message.content && <div className={`${styles.message} ${message.type === "success" ? styles.success : styles.error}`}>{message.content}</div>}
      </form>

      {showConfirmation && (
        <div className={styles.confirmationModal}>
          <p>Atenție! Nu vei mai putea adăuga alți elevi de la această unitate de învățământ. Ești sigur că vrei să înscrii acești elevi?</p>
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
