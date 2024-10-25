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

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email) {
      setMessage({ type: "error", content: "Adresa de email este necesară!" });
      return;
    }

    if (alreadyRegistered) {
      setMessage({ type: "error", content: "Ați înscris deja elevi de la această școală." });
      return;
    }

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

  return (
    <div className={styles["form-container"]}>
      <h2>Înscriere elevi</h2>

      {alreadyRegistered && <div className={`${styles.message} ${styles.error}`}>Ați înscris deja elevi de la această școală.</div>}

      <form onSubmit={handleSubmit} className={styles["form-group"]}>
        {/* Grup pentru clasele a IV-a și a V-a */}
        <div className={styles["class-groups"]}>
          <div className={styles["class-group"]}>
            <h3>Clasa a IV-a</h3>
            {studentsByClass["a IV-a"].map((student, index) => (
              <input key={index} type="text" placeholder={`Nume Elev ${index + 1}`} value={student} onChange={(e) => handleChange("a IV-a", index, e.target.value)} className={styles["input-field"]} />
            ))}
          </div>

          <div className={styles["class-group"]}>
            <h3>Clasa a V-a</h3>
            {studentsByClass["a V-a"].map((student, index) => (
              <input key={index} type="text" placeholder={`Nume Elev ${index + 1}`} value={student} onChange={(e) => handleChange("a V-a", index, e.target.value)} className={styles["input-field"]} />
            ))}
          </div>
        </div>

        {/* Grup pentru clasele a VI-a și a VII-a */}
        <div className={styles["class-groups"]}>
          <div className={styles["class-group"]}>
            <h3>Clasa a VI-a</h3>
            {studentsByClass["a VI-a"].map((student, index) => (
              <input key={index} type="text" placeholder={`Nume Elev ${index + 1}`} value={student} onChange={(e) => handleChange("a VI-a", index, e.target.value)} className={styles["input-field"]} />
            ))}
          </div>

          <div className={styles["class-group"]}>
            <h3>Clasa a VII-a</h3>
            {studentsByClass["a VII-a"].map((student, index) => (
              <input
                key={index}
                type="text"
                placeholder={`Nume Elev ${index + 1}`}
                value={student}
                onChange={(e) => handleChange("a VII-a", index, e.target.value)}
                className={styles["input-field"]}
              />
            ))}
          </div>
        </div>

        <div className={styles["email-container"]}>
          <div className={styles["guide-container"]}>
            <input type="text" placeholder="Profesor îndrumător" value={profesorIndrumator} onChange={(e) => setProfesorIndrumator(e.target.value)} className={styles["input-field"]} />
            <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} className={styles["input-field"]} required />
            <input type="tel" placeholder="Telefon" value={telefon} onChange={(e) => setTelefon(e.target.value)} className={styles["input-field"]} />
          </div>
        </div>

        <button type="submit" className={styles["submit-button"]} disabled={loading || alreadyRegistered}>
          {loading ? "Înscriere în curs..." : "Înscrie Elevi"}
        </button>

        {/* Mesaj de succes/eroare sub buton */}
        {message.content && <div className={`${styles.message} ${message.type === "success" ? styles.success : styles.error}`}>{message.content}</div>}
      </form>
    </div>
  );
}

export default ClassForm;
