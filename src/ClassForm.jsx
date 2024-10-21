// src/components/ClassForm.jsx
import React, { useState } from "react";
import "./ClassForm.module.css"; // Importăm stilurile CSS

function ClassForm({ selectedClass, selectedSchool }) {
  const [students, setStudents] = useState(Array(5).fill(""));
  const [loading, setLoading] = useState(false);

  // Determinăm clasa CSS în funcție de clasa selectată
  const getClassColor = (selectedClass) => {
    switch (selectedClass) {
      case "a IV-a":
        return "class-iv";
      case "a V-a":
        return "class-v";
      case "a VI-a":
        return "class-vi";
      case "a VII-a":
        return "class-vii";
      default:
        return "";
    }
  };

  const handleChange = (index, value) => {
    const newStudents = [...students];
    newStudents[index] = value;
    setStudents(newStudents);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (students.some((student) => student.trim() === "")) {
      alert("Toate câmpurile trebuie completate!");
      return;
    }

    setLoading(true);

    try {
      // Simulăm salvarea datelor
      await new Promise((resolve) => setTimeout(resolve, 1000));

      alert("Elevii au fost înscriși cu succes!");
      setStudents(Array(5).fill(""));
    } catch (error) {
      console.error("Eroare la înscriere:", error);
      alert("A apărut o eroare. Încercați din nou.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`form-container ${getClassColor(selectedClass)}`}>
      <h2>Înscriere pentru clasa {selectedClass}</h2>
      <form onSubmit={handleSubmit} className="form-group">
        {students.map((student, index) => (
          <input key={index} type="text" placeholder={`Nume Elev ${index + 1}`} value={student} onChange={(e) => handleChange(index, e.target.value)} className="input-field" />
        ))}
        <button type="submit" className="submit-button" disabled={loading}>
          {loading ? "Înscriere în curs..." : "Înscrie Elevi"}
        </button>
      </form>
    </div>
  );
}

export default ClassForm;
