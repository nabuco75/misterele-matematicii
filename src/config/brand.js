export const BRAND = {
  authorLine: "Realizat de Patrichi A. Ștefan — Persoană Fizică Autorizată",
  usageLine: "Utilizare: Școala Gimnazială „Ștefan cel Mare” Vaslui",
  siteName: "Misterele Matematicii — Aplicație de înscriere",
  year: new Date().getFullYear(),

  // ✅ eliminăm complet `process.env`
  version: import.meta.env.VITE_APP_VERSION || "1.0.0",
  commit: import.meta.env.VITE_GIT_SHA?.slice(0, 7),
};
