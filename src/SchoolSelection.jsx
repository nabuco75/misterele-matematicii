import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import styles from "./SchoolSelection.module.css";

function SchoolSelection({ setSelectedSchool }) {
  const [counties, setCounties] = useState([]);
  const [localities, setLocalities] = useState([]);
  const [schools, setSchools] = useState([]);
  const [schoolStatus, setSchoolStatus] = useState({}); // Stare pentru a urmări statusul școlilor (dacă au deja elevi)
  const [selectedCounty, setSelectedCounty] = useState("");
  const [selectedLocality, setSelectedLocality] = useState("");
  const [selectedSchoolId, setSelectedSchoolId] = useState("");

  // Fetch the list of unique counties from Firestore
  useEffect(() => {
    const fetchCounties = async () => {
      const querySnapshot = await getDocs(collection(db, "schools"));
      const countiesList = new Set();
      querySnapshot.forEach((doc) => {
        countiesList.add(doc.data().county);
      });
      setCounties([...countiesList]); // Convert set to array
      console.log("Counties fetched:", countiesList);
    };
    fetchCounties();
  }, []);

  // Fetch the localities based on the selected county
  useEffect(() => {
    if (selectedCounty) {
      const fetchLocalities = async () => {
        const querySnapshot = await getDocs(query(collection(db, "schools"), where("county", "==", selectedCounty)));
        const localitiesList = new Set();
        querySnapshot.forEach((doc) => {
          localitiesList.add(doc.data().locality);
        });
        setLocalities([...localitiesList]); // Convert set to array
        console.log("Localities fetched for county", selectedCounty, ":", localitiesList);
      };
      fetchLocalities();
    } else {
      setLocalities([]); // Reset localities if no county selected
      console.log("No county selected, resetting localities.");
    }
  }, [selectedCounty]);

  // Fetch the schools based on the selected locality and check if they already have students registered
  useEffect(() => {
    if (selectedLocality) {
      const fetchSchools = async () => {
        const querySnapshot = await getDocs(query(collection(db, "schools"), where("county", "==", selectedCounty), where("locality", "==", selectedLocality)));
        const schoolsList = [];
        const statusList = {};

        for (const doc of querySnapshot.docs) {
          const school = { id: doc.id, name: doc.data().name };

          // Verificăm dacă școala are deja elevi înscriși
          const q = query(collection(db, "registration"), where("schoolId", "==", doc.id));
          const querySnapshotReg = await getDocs(q);
          statusList[doc.id] = !querySnapshotReg.empty; // True dacă elevii sunt deja înscriși

          schoolsList.push(school);
        }

        setSchools(schoolsList);
        setSchoolStatus(statusList); // Setăm statusul pentru fiecare școală
        console.log("Schools fetched for locality", selectedLocality, ":", schoolsList);
      };
      fetchSchools();
    } else {
      setSchools([]); // Reset schools if no locality selected
      console.log("No locality selected, resetting schools.");
    }
  }, [selectedLocality, selectedCounty]);

  return (
    <div className={styles.selectionContainer}>
      <label htmlFor="countySelect">Alege județul:</label>
      <select
        id="countySelect"
        value={selectedCounty}
        onChange={(e) => {
          setSelectedCounty(e.target.value);
          setSelectedLocality("");
          setSelectedSchoolId(""); // Reset selections
          setSchools([]); // Clear schools when changing county
          setLocalities([]); // Clear localities when changing county
          console.log("County selected:", e.target.value);
        }}
        className={styles.selectField}
      >
        <option value="">Selectează județul</option>
        {counties.map((county, index) => (
          <option key={index} value={county}>
            {county}
          </option>
        ))}
      </select>

      {selectedCounty && (
        <>
          <label htmlFor="localitySelect">Alege localitatea:</label>
          <select
            id="localitySelect"
            value={selectedLocality}
            onChange={(e) => {
              setSelectedLocality(e.target.value);
              setSelectedSchoolId(""); // Reset school when locality changes
              setSchools([]); // Clear schools list
              console.log("Locality selected:", e.target.value);
            }}
            className={styles.selectField}
          >
            <option value="">Selectează localitatea</option>
            {localities.map((locality, index) => (
              <option key={index} value={locality}>
                {locality}
              </option>
            ))}
          </select>
        </>
      )}

      {selectedLocality && (
        <>
          <label htmlFor="schoolSelect">Alege școala:</label>
          <select
            id="schoolSelect"
            value={selectedSchoolId}
            onChange={(e) => {
              const selectedSchool = schools.find((school) => school.id === e.target.value);
              setSelectedSchoolId(e.target.value);
              setSelectedSchool(selectedSchool ? selectedSchool.id : ""); // Trimite ID-ul școlii selectate, nu numele
              console.log("School selected:", selectedSchool ? selectedSchool.id : "None selected");
            }}
            className={styles.selectField}
          >
            <option value="">Selectează școala</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id} disabled={schoolStatus[school.id]}>
                {school.name} {schoolStatus[school.id] ? "(Elevii sunt deja înscriși)" : ""}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

export default SchoolSelection;
