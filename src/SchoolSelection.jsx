import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import styles from "./SchoolSelection.module.css";

function SchoolSelection({ selectedSchool, setSelectedSchool }) {
  const [counties, setCounties] = useState([]);
  const [localities, setLocalities] = useState([]);
  const [schools, setSchools] = useState([]);
  const [selectedCounty, setSelectedCounty] = useState("");
  const [selectedLocality, setSelectedLocality] = useState("");

  // Fetch the list of unique counties from Firestore
  useEffect(() => {
    const fetchCounties = async () => {
      const querySnapshot = await getDocs(collection(db, "schools"));
      const countiesList = new Set();
      querySnapshot.forEach((doc) => {
        countiesList.add(doc.data().county);
      });
      setCounties([...countiesList]); // Convert set to array
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
      };
      fetchLocalities();
    }
  }, [selectedCounty]);

  // Fetch the schools based on the selected locality
  useEffect(() => {
    if (selectedLocality) {
      const fetchSchools = async () => {
        const querySnapshot = await getDocs(query(collection(db, "schools"), where("county", "==", selectedCounty), where("locality", "==", selectedLocality)));
        const schoolsList = [];
        querySnapshot.forEach((doc) => {
          schoolsList.push(doc.data().name);
        });
        setSchools(schoolsList);
      };
      fetchSchools();
    }
  }, [selectedLocality]);

  return (
    <div className={styles.selectionContainer}>
      <label htmlFor="countySelect">Alege județul:</label>
      <select
        id="countySelect"
        value={selectedCounty}
        onChange={(e) => {
          setSelectedCounty(e.target.value);
          setSelectedLocality("");
          setSchools([]);
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
          <select id="localitySelect" value={selectedLocality} onChange={(e) => setSelectedLocality(e.target.value)} className={styles.selectField}>
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
          <select id="schoolSelect" value={selectedSchool} onChange={(e) => setSelectedSchool(e.target.value)} className={styles.selectField}>
            <option value="">Selectează școala</option>
            {schools.map((school, index) => (
              <option key={index} value={school}>
                {school}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

export default SchoolSelection;
