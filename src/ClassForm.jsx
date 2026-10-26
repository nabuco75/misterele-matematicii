// ClassForm.jsx
import React, { useState, useEffect } from "react";
import emailjs from "emailjs-com";
import { db } from "./firebase";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  onSnapshot,
  writeBatch,
} from "firebase/firestore";
import styles from "./ClassForm.module.css";

// Codul de acces nu mai apare în clar în aplicația publicată;
// se compară doar amprenta SHA-256 a codului introdus.
// Pentru a schimba codul: node -e "console.log(require('crypto').createHash('sha256').update('COD_NOU').digest('hex'))"
const ACCESS_CODE_HASH =
  "d530d32a93323ef75e161781fe19cc792aaa013cb75d56387d1e319c32d37ea7";

const sha256Hex = async (text) => {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const escapeHtml = (str) =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// numără elevii deja înscriși (citire proaspătă din baza de date)
const fetchCountsByClass = async (schoolId, classes) => {
  const snap = await getDocs(
    query(collection(db, "registration"), where("schoolId", "==", schoolId))
  );
  const counts = Object.fromEntries(classes.map((c) => [c, 0]));
  snap.forEach((d) => {
    const data = d.data();
    if (counts[data.class] !== undefined) {
      counts[data.class] += Array.isArray(data.students)
        ? data.students.length
        : 0;
    }
  });
  return counts;
};

const CLASS_COLORS = {
  "a IV-a": { from: "#7c4dff", to: "#3f8efc" },
  "a V-a": { from: "#34d399", to: "#059669" },
  "a VI-a": { from: "#fbbf24", to: "#f59e0b" },
  "a VII-a": { from: "#a78bfa", to: "#7c3aed" },
};

// === IDENTIFICARE ȘCOLI VIP (FĂRĂ LIMITĂ) ===
const isVipSchool = (schoolName) => {
  if (!schoolName) return false;

  const normalize = (str) => {
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  };

  const target = normalize(schoolName);

  return (
    (target.includes("stefancelmare") &&
      target.includes("vaslui")) ||
    (target.includes("georgetutoveanu") &&
      target.includes("barlad")) ||
    (target.includes("constantinparfene") &&
      target.includes("vaslui"))
  );
};

// validare nume elev ("" = valid; câmpurile goale sunt permise)
// full=false → doar greșelile evidente (@, cifre), afișate în timp ce scrie
const validateStudent = (value, full = true) => {
  const v = (value || "").trim();
  if (!v) return "";
  if (v.includes("@"))
    return "Numele elevului nu poate conține @ (adresa de email se scrie mai jos).";
  if (/\d/.test(v)) return "Numele elevului nu poate conține cifre.";
  if (full && v.split(/\s+/).filter(Boolean).length < 2)
    return "Scrieți numele și prenumele elevului.";
  return "";
};

const GDPR_REMINDER =
  "Nu uitați să le transmiteți elevilor să aducă acordul GDPR semnat!";

const EMAIL_FAILED_MSG =
  "✅ Elevii au fost înscriși cu succes! Mesajul de confirmare prin email a întâmpinat probleme la trimitere. Puteți descărca confirmarea înscrierii de aici:";

// pagina de confirmare (printabilă / salvabilă ca PDF)
const buildReceiptHtml = (r) => {
  const rows = r.classes
    .map(
      ({ className, students }) =>
        `<tr><td>${escapeHtml(className)}</td><td><ol>${students
          .map((s) => `<li>${escapeHtml(s)}</li>`)
          .join("")}</ol></td></tr>`
    )
    .join("");
  const total = r.classes.reduce((n, c) => n + c.students.length, 0);

  return `<!doctype html>
<html lang="ro"><head><meta charset="utf-8">
<title>Confirmare înscriere - ${escapeHtml(r.schoolName)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:32px auto;padding:0 16px;color:#111}
  h1{font-size:22px;margin-bottom:4px} h2{font-size:16px;font-weight:normal;color:#444;margin-top:0}
  table{width:100%;border-collapse:collapse;margin-top:16px}
  th,td{border:1px solid #999;padding:8px;text-align:left;vertical-align:top}
  th{background:#f0f0f0} ol{margin:0;padding-left:20px}
  .meta p{margin:4px 0} .note{margin-top:24px;font-size:13px;color:#555}
  @media print{button{display:none}}
</style></head><body>
<h1>Confirmare înscriere — Misterele Matematicii</h1>
<h2>Școala Gimnazială „Ștefan cel Mare” Vaslui</h2>
<div class="meta">
  <p><strong>Școala:</strong> ${escapeHtml(r.schoolName)}</p>
  <p><strong>Profesor îndrumător:</strong> ${escapeHtml(r.profesor)}</p>
  <p><strong>Email:</strong> ${escapeHtml(r.email)} &nbsp; <strong>Telefon:</strong> ${escapeHtml(r.telefon)}</p>
  <p><strong>Data înscrierii:</strong> ${escapeHtml(r.date)}</p>
</div>
<table><thead><tr><th>Clasa</th><th>Elevi înscriși</th></tr></thead><tbody>${rows}</tbody></table>
<p><strong>Total elevi înscriși:</strong> ${total}</p>
<p style="border:2px solid #b45309;background:#fff7ed;padding:10px;font-weight:bold">⚠️ IMPORTANT: ${GDPR_REMINDER}</p>
<p class="note">Înscrierea a fost înregistrată în baza de date a concursului.
Pentru întrebări: contact@scoala5vaslui.ro</p>
<button onclick="window.print()">Printează / Salvează ca PDF</button>
</body></html>`;
};

const downloadReceipt = (r) => {
  const html = buildReceiptHtml(r);
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
    return;
  }
  // fereastra a fost blocată → descărcăm confirmarea ca fișier
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Confirmare_inscriere_${r.schoolName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const barColor = (pct) =>
  pct < 60 ? "#22c55e" : pct < 100 ? "#f59e0b" : "#ef4444";

function ClassForm({ selectedSchool, isAdminOverride = false }) {
  const schoolId = selectedSchool?.id || "";
  const schoolName = selectedSchool?.name || "";

  const [isAuthenticated, setIsAuthenticated] =
    useState(isAdminOverride);
  const [accessCode, setAccessCode] = useState("");
  const [authError, setAuthError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const MAX_ATTEMPTS = 3;

  const isVip = isVipSchool(schoolName);
  const isUnlimited = isVip || isAdminOverride;

  const [studentsByClass, setStudentsByClass] = useState({
    "a IV-a": Array(5).fill(""),
    "a V-a": Array(5).fill(""),
    "a VI-a": Array(5).fill(""),
    "a VII-a": Array(5).fill(""),
  });

  const [email, setEmail] = useState("");
  const [profesorIndrumator, setProfesorIndrumator] =
    useState("");
  const [telefon, setTelefon] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({
    type: "",
    content: "",
  });

  const [countByClass, setCountByClass] = useState({
    "a IV-a": 0,
    "a V-a": 0,
    "a VI-a": 0,
    "a VII-a": 0,
  });

  const [errors, setErrors] = useState({
    email: "",
    telefon: "",
    profesorIndrumator: "",
  });
  const [showConfirmation, setShowConfirmation] =
    useState(false);
  // confirmarea descărcabilă (afișată când emailul nu a plecat)
  const [receipt, setReceipt] = useState(null);
  // câmpurile de elevi marcate greșit la apăsarea „Înscrie” (cheie: "clasa|index")
  const [studentSubmitErrors, setStudentSubmitErrors] = useState({});

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^\d{10}$/;

  // returnează mesajul de eroare pentru numele profesorului ("" = valid)
  const validateProfesor = (value) => {
    const v = value.trim();
    if (!v) return "Numele profesorului îndrumător este necesar!";
    if (v.includes("@"))
      return "Ați introdus o adresă de email. Aici scrieți numele și prenumele profesorului; emailul se completează în câmpul de mai jos.";
    if (/\d/.test(v))
      return "Numele nu poate conține cifre. Telefonul se completează în câmpul de mai jos.";
    if (v.split(/\s+/).filter(Boolean).length < 2)
      return "Scrieți numele și prenumele profesorului (ex: Popescu Maria).";
    return "";
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();

    if (isBlocked) return;

    let codeHash = "";
    try {
      codeHash = await sha256Hex(accessCode.trim());
    } catch (err) {
      console.error("Verificarea codului nu este disponibilă:", err);
      setAuthError(
        "❌ Verificarea codului nu este disponibilă în acest browser. Deschideți pagina prin https."
      );
      return;
    }

    if (codeHash === ACCESS_CODE_HASH) {
      setIsAuthenticated(true);
      setAuthError("");
      setAccessCode("");
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);

      if (newAttempts >= MAX_ATTEMPTS) {
        setIsBlocked(true);
        setAuthError(
          "🚫 Prea multe încercări greșite! Pagina se va reîncărca în 5 secunde..."
        );
        setTimeout(() => window.location.reload(), 5000);
      } else {
        setAuthError(
          `❌ Cod incorect! Încercări rămase: ${
            MAX_ATTEMPTS - newAttempts
          }`
        );
        setAccessCode("");
      }
    }
  };

  useEffect(() => {
    if (!schoolId) return;
    const classes = Object.keys(studentsByClass);
    const unsubs = classes.map((c) => {
      const qReg = query(
        collection(db, "registration"),
        where("schoolId", "==", schoolId),
        where("class", "==", c)
      );
      return onSnapshot(qReg, (snap) => {
        let total = 0;
        snap.forEach((docu) => {
          const arr = Array.isArray(
            docu.data()?.students
          )
            ? docu.data().students
            : [];
          total += arr.length;
        });
        setCountByClass((prev) => ({
          ...prev,
          [c]: total,
        }));
      });
    });
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const handleChange = (className, index, value) => {
    const next = [...studentsByClass[className]];
    next[index] = value;
    setStudentsByClass((prev) => ({
      ...prev,
      [className]: next,
    }));
    // eroarea de la trimitere dispare când câmpul devine corect
    const key = `${className}|${index}`;
    if (studentSubmitErrors[key] && !validateStudent(value)) {
      setStudentSubmitErrors((p) => {
        const rest = { ...p };
        delete rest[key];
        return rest;
      });
    }
  };

  const handleBlur = (field) => {
    if (field === "email")
      setErrors((p) => ({
        ...p,
        email: emailRegex.test(email)
          ? ""
          : "Adresa de email nu este validă!",
      }));
    if (field === "telefon")
      setErrors((p) => ({
        ...p,
        telefon: phoneRegex.test(telefon)
          ? ""
          : "Numărul de telefon trebuie să conțină 10 cifre!",
      }));
    if (field === "profesorIndrumator")
      setErrors((p) => ({
        ...p,
        profesorIndrumator: validateProfesor(profesorIndrumator),
      }));
  };

  const localProposedCount = (className) =>
    studentsByClass[className]
      .map((s) => s?.trim())
      .filter(Boolean).length;

  const handleInscrieClick = async (e) => {
    e.preventDefault();
    setMessage({ type: "", content: "" });

    // validare nume elevi
    const badStudents = {};
    let firstStudentError = "";
    Object.keys(studentsByClass).forEach((className) => {
      studentsByClass[className].forEach((s, index) => {
        const err = validateStudent(s);
        if (err) {
          badStudents[`${className}|${index}`] = err;
          if (!firstStudentError)
            firstStudentError = `Clasa ${className}, elevul ${index + 1}: ${err}`;
        }
      });
    });
    setStudentSubmitErrors(badStudents);
    if (firstStudentError) {
      setMessage({ type: "error", content: firstStudentError });
      return;
    }

    const profesorError = validateProfesor(profesorIndrumator);
    if (profesorError) {
      setErrors((p) => ({ ...p, profesorIndrumator: profesorError }));
      setMessage({ type: "error", content: profesorError });
      return;
    }

    if (
      !emailRegex.test(email) ||
      !phoneRegex.test(telefon)
    ) {
      setMessage({
        type: "error",
        content:
          "Vă rugăm să completați corect toate câmpurile!",
      });
      return;
    }
    if (!schoolId) {
      setMessage({
        type: "error",
        content: "Selectați mai întâi școala.",
      });
      return;
    }

    // limita de 5 elevi/clasă doar pentru utilizatori normali
    if (!isUnlimited) {
      const classes = Object.keys(studentsByClass);
      for (const className of classes) {
        const proposed = studentsByClass[className]
          .map((s) => s?.trim())
          .filter(Boolean).length;
        if (!proposed) continue;

        const currentInDb = countByClass[className];

        if (currentInDb >= 5) {
          setMessage({
            type: "error",
            content: `Școala dvs. a atins deja limita de 5 elevi pentru ${className}. În caz de neclarități, contact@scoala5vaslui.ro`,
          });
          return;
        }

        if (currentInDb + proposed > 5) {
          setMessage({
            type: "error",
            content: `Pentru ${className} mai sunt disponibile doar ${
              5 - currentInDb
            } loc(uri). Ajustați lista.`,
          });
          return;
        }
      }
    }

    setShowConfirmation(true);
  };

  const handleConfirmInscriere = async () => {
    setShowConfirmation(false);
    setLoading(true);
    setMessage({ type: "", content: "" });
    setReceipt(null);

    const resetForm = () => {
      setStudentsByClass({
        "a IV-a": Array(5).fill(""),
        "a V-a": Array(5).fill(""),
        "a VI-a": Array(5).fill(""),
        "a VII-a": Array(5).fill(""),
      });
      setEmail("");
      setProfesorIndrumator("");
      setTelefon("");
      setErrors({
        email: "",
        telefon: "",
        profesorIndrumator: "",
      });
    };

    const classes = Object.keys(studentsByClass);

    // —— 1. Salvare în baza de date (totul sau nimic)
    try {
      // re-verificare limită cu date proaspete, chiar înainte de scriere
      // (alt profesor de la aceeași școală poate fi înscris între timp)
      if (!isUnlimited) {
        const freshCounts = await fetchCountsByClass(schoolId, classes);
        for (const className of classes) {
          const proposed = localProposedCount(className);
          if (proposed && freshCounts[className] + proposed > 5) {
            const left = Math.max(0, 5 - freshCounts[className]);
            setMessage({
              type: "error",
              content: left
                ? `Pentru ${className} mai sunt disponibile doar ${left} loc(uri). Ajustați lista.`
                : `Școala dvs. a atins deja limita de 5 elevi pentru ${className}. În caz de neclarități, contact@scoala5vaslui.ro`,
            });
            setLoading(false);
            return;
          }
        }
      }

      const batch = writeBatch(db);
      for (const className of classes) {
        const filtered = studentsByClass[className]
          .map((s) => s?.trim())
          .filter(Boolean);
        if (!filtered.length) continue;

        // NOTĂ: câmpul "profesorIndrumatorEmail" conține, istoric, NUMELE
        // profesorului (exporturile îl citesc așa). Emailul real e în "profesorEmail".
        batch.set(doc(collection(db, "registration")), {
          class: className,
          school: schoolName,
          schoolId,
          students: filtered,
          profesorIndrumatorEmail: profesorIndrumator,
          profesorEmail: email.trim(),
          telefon,
          createdAt: Date.now(),
        });
      }
      await batch.commit();
    } catch (err) {
      console.error("Eroare la înscriere:", err);
      setMessage({
        type: "error",
        content:
          "A apărut o eroare la înscriere. Încercați din nou.",
      });
      setLoading(false);
      return;
    }

    // —— 2. Elevii sunt salvați; trimitem emailul de confirmare.
    // Dacă emailul eșuează, NU cerem reînscrierea (ar dubla elevii),
    // ci oferim confirmarea spre descărcare.
    const receiptData = {
      schoolName,
      profesor: profesorIndrumator.trim(),
      email: email.trim(),
      telefon,
      date: new Date().toLocaleString("ro-RO"),
      classes: classes
        .map((c) => ({
          className: c,
          students: studentsByClass[c].map((s) => s?.trim()).filter(Boolean),
        }))
        .filter((c) => c.students.length),
    };

    try {
      const rows = classes
        .map((c) => {
          const arr = studentsByClass[c]
            .map((s) => s?.trim())
            .filter(Boolean);
          if (!arr.length) return "";
          const li = arr
            .map((s) => `<li>${escapeHtml(s)}</li>`)
            .join("");
          return `<tr><td>${c}</td><td><ul>${li}</ul></td></tr>`;
        })
        .filter(Boolean)
        .join("");

      const emailContent =
        "<table border='1' cellpadding='5' cellspacing='0'><thead><tr><th>Clasa</th><th>Elevi</th></tr></thead><tbody>" +
        rows +
        "</tbody></table>" +
        `<p style="margin-top:16px;padding:10px;border:2px solid #b45309;background:#fff7ed;font-weight:bold">⚠️ IMPORTANT: ${GDPR_REMINDER}</p>`;

      const response = await emailjs.send(
        "service_e2pf9w6",
        "template_st5cb5c",
        {
          to_name: email,
          from_name: "Școala Stefan cel Mare Vaslui",
          students: emailContent,
          reply_to: email,
        },
        "IpIiJlmFDSQJ6WnbS"
      );

      if (response.status === 200) {
        const successMsg = isUnlimited
          ? "✅ Elevii au fost înscriși cu succes! Puteți adăuga alți elevi completând din nou formularul."
          : "Elevii au fost înscriși și emailul a fost trimis cu succes!";

        setMessage({ type: "success", content: successMsg });
      } else {
        setMessage({ type: "warning", content: EMAIL_FAILED_MSG });
        setReceipt(receiptData);
      }
      resetForm();
    } catch (err) {
      console.error("Eroare la trimiterea emailului:", err);
      setMessage({ type: "warning", content: EMAIL_FAILED_MSG });
      setReceipt(receiptData);
      resetForm();
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => setShowConfirmation(false);

  // autentificare doar pentru user normal
  if (!isAuthenticated && !isAdminOverride) {
    return (
      <>
        <div className={styles.authOverlay}>
          <div className={styles.authModal}>
            <div className={styles.authHeader}>
              <div className={styles.authIcon}>🔐</div>
              <h2 className={styles.authTitle}>
                Acces Restricționat
              </h2>
              <p className={styles.authSubtitle}>
                Doar profesorii îndrumători pot înscrie elevi la
                concurs
              </p>
            </div>

            <form
              onSubmit={handleAuthSubmit}
              className={styles.authForm}
            >
              <div className={styles.authInputGroup}>
                <label
                  htmlFor="accessCode"
                  className={styles.authLabel}
                >
                  Cod de acces profesor
                </label>
                <input
                  id="accessCode"
                  type="text"
                  value={accessCode}
                  onChange={(e) =>
                    setAccessCode(e.target.value)
                  }
                  placeholder="Introduceți codul de acces"
                  className={`${styles.authInput} ${
                    authError ? styles.authInputError : ""
                  }`}
                  disabled={isBlocked}
                  autoFocus
                />

                {authError && (
                  <div className={styles.authError}>
                    {authError}
                  </div>
                )}
              </div>

              <button
                type="submit"
                className={styles.authButton}
                disabled={isBlocked || !accessCode.trim()}
              >
                {isBlocked ? "Blocat..." : "Validează Codul"}
              </button>

              <div className={styles.authFooter}>
                <p>
                  <strong>Nu aveți cod?</strong> Contactați
                  coordonatorul la
                  <br />
                  <a href="mailto:contact@scoala5vaslui.ro">
                    contact@scoala5vaslui.ro
                  </a>
                </p>
              </div>

              <div className={styles.authAttempts}>
                {[...Array(MAX_ATTEMPTS)].map((_, i) => (
                  <span
                    key={i}
                    className={`${styles.attemptDot} ${
                      i < attempts ? styles.attemptUsed : ""
                    }`}
                  />
                ))}
              </div>
            </form>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className={styles["form-container"]}>
      <h2>Înscriere elevi</h2>

      {isAdminOverride && (
        <div className={styles.infoMessage}>
          🔧 <strong>Mod administrator:</strong> limita de 5
          elevi/școală nu se aplică. Puteți înscrie suplimentar
          elevi pentru această școală.
        </div>
      )}

      {isVip && !isAdminOverride && (
        <div className={styles.infoMessage}>
          ✨ <strong>Status Special:</strong> Această școală
          poate înscrie mai mulți elevi. După ce completați și
          trimiteți primii 5 elevi, formularul se va goli automat
          și puteți adăuga următoarea serie.
        </div>
      )}

      <form
        onSubmit={handleInscrieClick}
        className={styles["form-group"]}
      >
        <div className={styles["class-groups"]}>
          {Object.keys(studentsByClass).map((className) => {
            const used = countByClass[className];
            const pending = localProposedCount(className);
            const g = CLASS_COLORS[className];

            let left, total, pct;

            if (isUnlimited) {
              left = "∞";
              total = used + pending;
              pct = 0;
            } else {
              left = Math.max(0, 5 - used - pending);
              total = Math.min(5, used + pending);
              pct = Math.round((total / 5) * 100);
            }

            return (
              <div
                className={styles["class-group"]}
                key={className}
              >
                <div
                  className={styles.statChip}
                  style={{
                    "--chip-from": g.from,
                    "--chip-to": g.to,
                  }}
                >
                  <div className={styles.statTitle}>
                    {className}
                  </div>
                  <div className={styles.statRow}>
                    <span className={styles.statNum}>
                      {used}
                    </span>
                    <span className={styles.statSlash}>
                      {isUnlimited ? " total școală" : "/5"}
                    </span>
                  </div>
                  <div className={styles.statMeta}>
                    în curs: <strong>{pending}</strong> •
                    rămase: <strong>{left}</strong>
                  </div>
                </div>

                {!isUnlimited && (
                  <div className={styles.cardHeader}>
                    <div className={styles.classBadge}>
                      {className}
                    </div>
                    <div
                      className={styles.progressWrap}
                      aria-label={`Ocupate + în curs: ${total}/5`}
                    >
                      <div
                        className={styles.progressBar}
                        style={{
                          width: `${pct}%`,
                          background: barColor(pct),
                        }}
                      />
                    </div>
                    <div className={styles.progressText}>
                      {total}/5
                    </div>
                  </div>
                )}

                {studentsByClass[className].map(
                  (student, index) => {
                    const studentError =
                      validateStudent(student, false) ||
                      studentSubmitErrors[`${className}|${index}`] ||
                      "";
                    return (
                      <React.Fragment key={index}>
                        <input
                          type="text"
                          placeholder={`Nume și prenume elev ${
                            index + 1
                          }`}
                          value={student}
                          onChange={(e) =>
                            handleChange(
                              className,
                              index,
                              e.target.value
                            )
                          }
                          className={`${styles["input-field"]} ${
                            studentError ? styles.invalid : ""
                          }`}
                          disabled={
                            !isUnlimited && used >= 5
                          }
                        />
                        {studentError && (
                          <div className={styles["error-message"]}>
                            {studentError}
                          </div>
                        )}
                      </React.Fragment>
                    );
                  }
                )}

                <div className={styles["quota-inline"]}>
                  {isUnlimited ? (
                    <>
                      Total școală: {used} | În curs acum:{" "}
                      {pending}
                    </>
                  ) : (
                    <>
                      Ocupate: {used}/5 | în curs: {pending} |
                      rămase: {left}
                      {used >= 5 && (
                        <span
                          style={{
                            color: "#ef4444",
                            marginLeft: "10px",
                          }}
                        >
                          ● Limită atinsă
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles["email-container"]}>
          <div className={styles["guide-container"]}>
            <div className={styles["input-group"]}>
              <input
                type="text"
                placeholder="Nume și prenume profesor îndrumător"
                value={profesorIndrumator}
                onChange={(e) => {
                  const v = e.target.value;
                  setProfesorIndrumator(v);
                  // avertizare imediată la "@" sau cifre; dacă e deja o eroare
                  // afișată, o actualizăm la fiecare tastă (dispare când e corect)
                  setErrors((p) => ({
                    ...p,
                    profesorIndrumator:
                      v.includes("@") || /\d/.test(v) || p.profesorIndrumator
                        ? validateProfesor(v)
                        : "",
                  }));
                }}
                onBlur={() =>
                  handleBlur("profesorIndrumator")
                }
                className={`${styles["input-field"]} ${
                  errors.profesorIndrumator
                    ? styles.invalid
                    : ""
                }`}
              />
              {errors.profesorIndrumator && (
                <div className={styles["error-message"]}>
                  {errors.profesorIndrumator}
                </div>
              )}
            </div>

            <div className={styles["input-group"]}>
              <input
                type="email"
                placeholder="E-mail profesor (pentru confirmare)"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                onBlur={() => handleBlur("email")}
                className={`${styles["input-field"]} ${
                  errors.email ? styles.invalid : ""
                }`}
                required
              />
              {errors.email && (
                <div className={styles["error-message"]}>
                  {errors.email}
                </div>
              )}
            </div>

            <div className={styles["input-group"]}>
              <input
                type="tel"
                placeholder="Telefon (10 cifre)"
                value={telefon}
                onChange={(e) =>
                  setTelefon(e.target.value)
                }
                onBlur={() => handleBlur("telefon")}
                className={`${styles["input-field"]} ${
                  errors.telefon ? styles.invalid : ""
                }`}
              />
              {errors.telefon && (
                <div className={styles["error-message"]}>
                  {errors.telefon}
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          type="submit"
          className={styles["submit-button"]}
          disabled={loading}
        >
          {loading ? "Înscriere în curs..." : "Înscrie Elevi"}
        </button>

        {message.content && (
          <div
            className={`${styles.message} ${
              message.type === "success"
                ? styles.success
                : message.type === "warning"
                ? styles.warning
                : styles.error
            }`}
          >
            {message.content}
            {(message.type === "success" ||
              message.type === "warning") && (
              <div className={styles.gdprNotice}>
                ⚠️ <strong>IMPORTANT:</strong> {GDPR_REMINDER}
              </div>
            )}
            {receipt && message.type === "warning" && (
              <div style={{ marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => downloadReceipt(receipt)}
                  className={styles["submit-button"]}
                >
                  📄 Descarcă confirmarea înscrierii
                </button>
              </div>
            )}
          </div>
        )}
      </form>

      {showConfirmation && (
        <>
          <div className={styles.modalOverlay} />
          <div className={styles.confirmationModal}>
            <p>
              Confirmi înscrierea elevilor?
              {!isUnlimited &&
                " (Limita este 5 elevi/școală pentru fiecare ciclu.)"}
            </p>
            <button
              onClick={handleConfirmInscriere}
              className={styles.confirmButton}
            >
              DA
            </button>
            <button
              onClick={handleCancel}
              className={styles.cancelButton}
            >
              Anulează
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default ClassForm;
