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

const digitsOf = (s) => String(s || "").replace(/\D/g, "");

// ordinea de importanță a locului unde s-a găsit textul (numele profesorului primul)
export const MATCH_TIER = { nume: 0, contact: 1, elev: 2, scoala: 3, combinat: 4 };

// Caută în profesori (grupați, fiecare cu înscrierile lui). Pentru fiecare înscriere vedem în ce câmp
// apar TOATE cuvintele căutate: nume, contact (email/telefon), elev, școală; „combinat” = împrăștiate.
//   field: "all" sau unul dintre câmpuri → doar potrivirile din acel câmp
// Întoarce null dacă nu s-a căutat nimic; altfel profesorii găsiți, cu hits, tier (cea mai bună potrivire)
// și reasons (unde s-a găsit), ordonați: întâi potrivirile pe nume, apoi alfabetic.
export const searchTeachers = (teachers, search, field = "all") => {
  const words = plainText(search).split(" ").filter(Boolean);
  if (words.length === 0) return null;
  const qDigits = digitsOf(search);
  const has = (text) => {
    const hay = plainText(text);
    return words.every((w) => hay.includes(w));
  };
  return teachers
    .map((t) => {
      const hits = [];
      t.regs.forEach((r) => {
        const found = [];
        if (has(r.profesor)) found.push("nume");
        if (has(`${r.email} ${r.telefon}`) || (qDigits.length >= 4 && digitsOf(r.telefon).includes(qDigits)))
          found.push("contact");
        const matchedStudents = r.students.filter((st) => has(st));
        if (matchedStudents.length > 0) found.push("elev");
        if (has(`${r.scoala} ${r.localitate} ${r.judet} ${r.clasa}`)) found.push("scoala");
        if (
          found.length === 0 &&
          has([r.profesor, r.email, r.telefon, r.scoala, r.localitate, r.judet, r.clasa, ...r.students].join(" "))
        )
          found.push("combinat");
        const relevant = field === "all" ? found : found.filter((f) => f === field);
        if (relevant.length > 0) hits.push({ reg: r, found: relevant, matchedStudents });
      });
      if (hits.length === 0) return null;
      const tier = Math.min(...hits.flatMap((h) => h.found.map((f) => MATCH_TIER[f])));
      const reasons = [...new Set(hits.flatMap((h) => h.found))].sort((a, b) => MATCH_TIER[a] - MATCH_TIER[b]);
      return { ...t, hits, tier, reasons };
    })
    .filter(Boolean)
    .sort((a, b) => a.tier - b.tier || a.nume.localeCompare(b.nume, "ro", { sensitivity: "base" }));
};
