// Profesori îndrumători: validare și comparare de nume (comune pentru editorul școlii și căutarea globală).
//
// În înscriere (colecția `registration`): `profesorIndrumatorEmail` = NUMELE profesorului (denumire istorică),
// `profesorEmail` = emailul, `telefon` = telefonul.

// „Leoreanu Anca-Loredana” / „LEOREANU ANCA LOREDANA” / „Anca Loredana Leoreanu” → aceeași cheie
export const teacherKey = (name) =>
  String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");

// text pentru căutare: fără diacritice, litere mici, spații simple
export const plainText = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const validateTeacher = ({ nume = "", email = "", telefon = "" }) => {
  const v = nume.trim();
  if (!v) return "Numele profesorului îndrumător este necesar.";
  if (v.includes("@"))
    return "Ați scris o adresă de email în câmpul pentru nume. Emailul se scrie în câmpul „Email”.";
  if (/\d/.test(v)) return "Numele nu poate conține cifre.";
  if (v.split(/\s+/).filter(Boolean).length < 2)
    return "Scrieți numele și prenumele profesorului (ex: Popescu Maria).";
  if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return "Adresa de email nu este validă.";
  if (telefon.trim() && !/^[0-9+()\s.-]{6,20}$/.test(telefon.trim()))
    return "Numărul de telefon nu este valid (doar cifre, spații, +, -).";
  return "";
};

// numele curățat pentru salvare: spații simple, fără spații la capete
export const cleanTeacherName = (nume) => String(nume || "").trim().replace(/\s+/g, " ");
