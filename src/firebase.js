// Importă funcțiile necesare din SDK-ul Firebase
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth"; // Importă Authentication
import { getAnalytics } from "firebase/analytics";

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

// Inițializează Firestore
const db = getFirestore(app);

// Inițializează Authentication
const auth = getAuth(app);

// Inițializează Analytics (opțional)
const analytics = getAnalytics(app);

// Exportă instanțele Firestore și Authentication pentru a putea fi utilizate în alte componente
export { db, auth };
