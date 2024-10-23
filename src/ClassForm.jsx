import React, { useState, useEffect } from "react";
import emailjs from "emailjs-com";
import { db } from "./firebase";
import { collection, addDoc, getDocs, query, where } from "firebase/firestore";
import "./ClassForm.module.css";

function ClassForm({ selectedSchool, schoolId }) {
  const [studentsByClass, setStudentsByClass] = useState({
    "a IV-a": Array(5).fill(""),
    "a V-a": Array(5).fill(""),
    "a VI-a": Array(5).fill(""),
    "a VII-a": Array(5).fill(""),
  });

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", content: "" }); // Stare pentru mesaje dinamice
  const [alreadyRegistered, setAlreadyRegistered] = useState(false); // Stare pentru verificarea duplicatelor

  // Verifică dacă școala a înscris deja elevi
  useEffect(() => {
    console.log("Verificare schoolId:", schoolId); // Verificăm dacă schoolId este transmis corect
    if (schoolId) {
      const checkIfAlreadyRegistered = async () => {
        const q = query(collection(db, "registration"), where("schoolId", "==", schoolId));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          setAlreadyRegistered(true); // Marchez că sunt deja elevi înscriși
          console.log("Elevi deja înscriși pentru schoolId:", schoolId);
        }
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

    console.log("School ID trimis la Firebase:", schoolId); // Verificăm dacă schoolId este corect la trimiterea formularului

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
            schoolId: schoolId, // Asociază elevii cu ID-ul școlii
            students: filteredStudents,
          });
          console.log("Elevii au fost înscriși pentru clasa:", className);
        }
      }

      // Construim tabelul HTML cu fiecare elev pe o linie separată
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

      // Configurăm parametrii pentru email
      const templateParams = {
        to_name: email,
        from_name: "Școala Stefan cel Mare Vaslui",
        students: emailContent,
        reply_to: email,
      };

      // Trimitem emailul folosind EmailJS
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
    <div className="form-container">
      <h2>Înscriere elevi</h2>

      {/* Afișare mesaje dinamice */}
      {message.content && <div className={`message ${message.type}`}>{message.content}</div>}

      {alreadyRegistered && <div className="message error">Ați înscris deja elevi de la această școală.</div>}

      <form onSubmit={handleSubmit} className="form-group">
        {Object.keys(studentsByClass).map((className) => (
          <div key={className}>
            <h3>{`Clasa ${className}`}</h3>
            {studentsByClass[className].map((student, index) => (
              <input key={index} type="text" placeholder={`Nume Elev ${index + 1}`} value={student} onChange={(e) => handleChange(className, index, e.target.value)} className="input-field" />
            ))}
          </div>
        ))}

        <input type="email" placeholder="Introduceți adresa de email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" required />

        <button type="submit" className="submit-button" disabled={loading || alreadyRegistered}>
          {loading ? "Înscriere în curs..." : "Înscrie Elevi"}
        </button>
      </form>
    </div>
  );
}

export default ClassForm;
