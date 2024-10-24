import React from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext"; // Importăm AuthProvider și useAuth
import Landing from "./Landing";
import LoginForm from "./LoginForm";
import AdminDashboard from "./AdminDashboard";
import NavBar from "./NavBar";

function App() {
  return (
    <AuthProvider>
      <Router>
        <NavBar /> {/* NavBar va fi afișat în toate rutele */}
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<LoginForm />} />
          <Route
            path="/admin"
            element={
              <PrivateRoute>
                <AdminDashboard />
              </PrivateRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

// Componentă care protejează rutele sensibile
function PrivateRoute({ children }) {
  const { currentUser } = useAuth(); // Preluăm utilizatorul autenticat

  return currentUser ? children : <Navigate to="/login" />;
}

export default App;
