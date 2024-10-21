// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App"; // Corect: Importăm App.js fără extensie
import "./index.css"; // Stiluri globale

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
