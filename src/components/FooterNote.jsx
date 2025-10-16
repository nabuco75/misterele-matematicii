import React from "react";
import "../styles/attribution.css"; // aici ai CSS-ul cu .glass-footer etc.

export default function FooterNote() {
  const year = new Date().getFullYear();

  return (
    <footer className="glass-footer" role="contentinfo" aria-label="Informații autor și utilizare">
      <div className="glass-inner">
        <p className="glass-text">
          © {year} Dezvoltat de <strong>Patrichi A. Ștefan</strong> — Persoană Fizică Autorizată
          <span className="dot">•</span>
          <strong>Școala Gimnazială „Ștefan cel Mare” Vaslui</strong>
          <span className="dot">•</span>
          <em>Misterele Matematicii</em>
        </p>
      </div>
    </footer>
  );
}
