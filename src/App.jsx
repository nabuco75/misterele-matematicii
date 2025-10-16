import React from "react";
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import Landing from "./Landing";
import LoginForm from "./LoginForm";
import AdminDashboard from "./AdminDashboard";
import NavBar from "./NavBar";
import FooterNote from "./components/FooterNote"; // ✅ footer simplu

function App() {
  return (
    <AuthProvider>
      <Router>
        <NavBar /> {/* bara de navigare apare peste tot */}
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

// subcomponentă care gestionează rutele
function AppRoutes() {
  const location = useLocation();
  const hideFooter = location.pathname.startsWith("/login"); // ascunde footerul pe pagina de login

  return (
    <>
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

      {/* ✅ afișează footerul doar dacă nu e pagina de login */}
      {!hideFooter && <FooterNote />}
    </>
  );
}

// ✅ protejează rutele sensibile (admin)
function PrivateRoute({ children }) {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" />;
}

export default App;
