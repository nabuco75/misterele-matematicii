// Afișarea uniformă a numelor la tipărire / descărcare: „POPESCU ANA-MARIA” → „Popescu Ana-Maria”.
// Se aplică DOAR la ieșire (liste, PDF, Excel). În baza de date numele rămâne exact cum a fost scris,
// pentru că sala, codul și notele elevului sunt legate de numele salvat.
const SEPARATORS = /([\s\-'’./()]+)/;

const capitalize = (word) =>
  word ? word.charAt(0).toLocaleUpperCase("ro") + word.slice(1).toLocaleLowerCase("ro") : word;

export const displayName = (name) => {
  if (typeof name !== "string") return name ?? "";
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean
    .split(SEPARATORS)
    .map((part) => (SEPARATORS.test(part) ? part : capitalize(part)))
    .join("");
};

// elev pregătit pentru liste: nume elev + profesor îndrumător aranjate
export const withDisplayNames = (s) => ({
  ...s,
  nume: displayName(s.nume),
  profesor: displayName(s.profesor),
});
