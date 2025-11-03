import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import styles from "./SchoolSelection.module.css";

function SchoolSelection({ setSelectedSchool }) {
  const [counties, setCounties] = useState([]);
  const [localities, setLocalities] = useState([]);
  const [schools, setSchools] = useState([]);
  const [selectedCounty, setSelectedCounty] = useState("");
  const [selectedLocality, setSelectedLocality] = useState("");
  const [selectedSchoolId, setSelectedSchoolId] = useState("");

  // 1) județe - sortate alfabetic
  useEffect(() => {
    const fetchCounties = async () => {
      const snap = await getDocs(collection(db, "schools"));
      const setc = new Set();
      snap.forEach((d) => setc.add(d.data().county));
      const sorted = [...setc].sort((a, b) => 
        a.localeCompare(b, "ro", { sensitivity: "base" })
      );
      setCounties(sorted);
    };
    fetchCounties();
  }, []);

  // 2) localități - sortate alfabetic
  useEffect(() => {
    if (!selectedCounty) {
      setLocalities([]);
      return;
    }
    const fetchLocalities = async () => {
      const snap = await getDocs(query(collection(db, "schools"), where("county", "==", selectedCounty)));
      const setl = new Set();
      snap.forEach((d) => setl.add(d.data().locality));
      const sorted = [...setl].sort((a, b) => 
        a.localeCompare(b, "ro", { sensitivity: "base" })
      );
      setLocalities(sorted);
    };
    fetchLocalities();
  }, [selectedCounty]);

  // 3) școli - sortate alfabetic
  useEffect(() => {
    if (!selectedLocality) {
      setSchools([]);
      return;
    }
    const fetchSchools = async () => {
      const snap = await getDocs(query(collection(db, "schools"), where("county", "==", selectedCounty), where("locality", "==", selectedLocality)));
      const list = snap.docs.map((scDoc) => ({
        id: scDoc.id,
        name: scDoc.data().name,
      }));
      // sortare alfabetică după nume
      list.sort((a, b) => 
        a.name.localeCompare(b.name, "ro", { sensitivity: "base" })
      );
      setSchools(list);
    };
    fetchSchools();
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
          setSelectedSchoolId("");
          setSchools([]);
          setLocalities([]);
        }}
        className={styles.selectField}
      >
        <option value="">Selectează județul</option>
        {counties.map((county) => (
          <option key={county} value={county}>
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
              setSelectedSchoolId("");
              setSchools([]);
            }}
            className={styles.selectField}
          >
            <option value="">Selectează localitatea</option>
            {localities.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
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
              setSelectedSchoolId(e.target.value);
              setSelectedSchool(e.target.value); // trimitem ID-ul
            }}
            className={styles.selectField}
          >
            <option value="">Selectează școala</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

export default SchoolSelection;