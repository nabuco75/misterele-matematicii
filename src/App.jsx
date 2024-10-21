import React from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import Landing from "./Landing";
import LoginForm from "./LoginForm";
import AdminDashboard from "./AdminDashboard";

function App() {
  return (
    <Router>
      <Routes>
        {/* Ruta pentru pagina principală */}
        <Route path="/" element={<Landing />} />

        {/* Ruta pentru autentificare (Login) */}
        <Route path="/login" element={<LoginForm />} />

        {/* Ruta pentru dashboard-ul admin */}
        <Route path="/admin" element={<AdminDashboard />} />

        {/* Redirecționare în caz că ruta nu este găsită */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
