import React from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import Landing from "./Landing";
import LoginForm from "./LoginForm";
import AdminDashboard from "./AdminDashboard";

function App() {
  return (
    <Router>
      <Routes>
        {/* Forțăm remontarea componentei Landing folosind un key unic */}
        <Route path="/" element={<Landing key={Date.now()} />} />

        <Route path="/login" element={<LoginForm />} />

        <Route path="/admin" element={<AdminDashboard />} />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
