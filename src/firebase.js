// Importă funcțiile necesare din SDK-ul Firebase
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth"; // Importă Authentication
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

// Configurația Firebase pentru aplicația ta web
const firebaseConfig = {
  apiKey: "AIzaSyDwvJSGIbHlh0X2HbwemSHB6R9LOua8HMg",
  authDomain: "misterele-mat-inscriere.firebaseapp.com",
  projectId: "misterele-mat-inscriere",
  storageBucket: "misterele-mat-inscriere.appspot.com",
  messagingSenderId: "615844957160",
  appId: "1:615844957160:web:8c996fc06d59c0f777b25d",
  measurementId: "G-QL0LNJS91V",
};

// Inițializează Firebase
const app = initializeApp(firebaseConfig);

// App Check: dovedește serverului că cererile vin din acest site, nu dintr-un program.
// Se activează punând aici cheia de site reCAPTCHA v3 din Firebase Console → App Check
// (vezi README, „Securitate”). Cât timp e goală, aplicația funcționează ca înainte.
const RECAPTCHA_SITE_KEY = "";
if (RECAPTCHA_SITE_KEY && typeof window !== "undefined") {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

// Inițializează Firestore
const db = getFirestore(app);

// Inițializează Authentication
const auth = getAuth(app);

// Exportă instanțele Firestore și Authentication pentru a putea fi utilizate în alte componente
export { db, auth };
