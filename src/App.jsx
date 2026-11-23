import React, { Suspense, lazy } from "react";
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import Landing from "./Landing";
// partea de admin (și bibliotecile Excel/PDF) se descarcă doar când e nevoie,
// așa că pagina publică de înscriere se încarcă repede și pe telefon
const LoginForm = lazy(() => import("./LoginForm"));
const AdminDashboard = lazy(() => import("./AdminDashboard"));
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
      <Suspense fallback={<p style={{ textAlign: "center", padding: 40 }}>Se încarcă...</p>}>
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
      </Suspense>

      {/* ✅ afișează footerul doar dacă nu e pagina de login */}
      {!hideFooter && <FooterNote />}
    </>
  );
}

// ✅ protejează rutele sensibile (admin)
function PrivateRoute({ children }) {
  const { currentUser, isAdmin, logout } = useAuth();
  if (!currentUser) return <Navigate to="/login" />;
  if (!isAdmin)
    return (
      <div style={{ maxWidth: 520, margin: "60px auto", padding: 24, textAlign: "center" }}>
        <h2>Cont fără drepturi de administrator</h2>
        <p>
          Contul {currentUser.email} este autentificat, dar nu are acces la panoul de
          administrare.
        </p>
        <button type="button" onClick={logout}>
          Deconectare
        </button>
      </div>
    );
  return children;
}

export default App;
