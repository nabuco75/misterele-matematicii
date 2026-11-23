import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import styles from "./SchoolSelection.module.css";

// "  Vaslui " și "Vaslui" sunt același județ
const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const byRo = (a, b) => a.localeCompare(b, "ro", { sensitivity: "base" });
const sameText = (a, b) => byRo(a, b) === 0;

// valori unice (fără diferențe de majuscule/diacritice), sortate
const uniqueSorted = (values) => {
  const out = [];
  values.forEach((v) => {
    if (v && !out.some((o) => sameText(o, v))) out.push(v);
  });
  return out.sort(byRo);
};

function SchoolSelection({ setSelectedSchool }) {
  // toată lista se citește o singură dată; filtrarea se face aici
  const [allSchools, setAllSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedCounty, setSelectedCounty] = useState("");
  const [selectedLocality, setSelectedLocality] = useState("");
  const [selectedSchoolId, setSelectedSchoolId] = useState("");

  useEffect(() => {
    let alive = true;
    getDocs(collection(db, "schools"))
      .then((snap) => {
        if (!alive) return;
        setAllSchools(
          snap.docs
            .map((d) => {
              const data = d.data();
              return {
                id: d.id,
                name: clean(data.name),
                county: clean(data.county),
                locality: clean(data.locality),
                vip: data.vip === true,
              };
            })
            .filter((s) => s.name && s.county && s.locality)
        );
      })
      .catch((err) => {
        console.error("Eroare la încărcarea școlilor:", err);
        if (alive)
          setLoadError(
            "Lista școlilor nu s-a putut încărca. Verificați conexiunea la internet și reîncărcați pagina."
          );
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const counties = useMemo(() => uniqueSorted(allSchools.map((s) => s.county)), [allSchools]);
  const localities = useMemo(
    () =>
      uniqueSorted(
        allSchools.filter((s) => sameText(s.county, selectedCounty)).map((s) => s.locality)
      ),
    [allSchools, selectedCounty]
  );
  const schools = useMemo(
    () =>
      allSchools
        .filter((s) => sameText(s.county, selectedCounty) && sameText(s.locality, selectedLocality))
        .sort((a, b) => byRo(a.name, b.name)),
    [allSchools, selectedCounty, selectedLocality]
  );

  return (
    <div className={styles.selectionContainer}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>Alegeți școala</h2>
        <p className={styles.cardHint}>Județul, apoi localitatea și școala la care predați.</p>
      </div>

      {loadError && (
        <p role="alert" style={{ color: "#b91c1c", fontWeight: 600 }}>
          {loadError}
        </p>
      )}

      <label htmlFor="countySelect">Județul</label>
      <select
        id="countySelect"
        value={selectedCounty}
        disabled={loading || !!loadError}
        onChange={(e) => {
          setSelectedCounty(e.target.value);
          setSelectedLocality("");
          setSelectedSchoolId("");
          setSelectedSchool(null);
        }}
        className={styles.selectField}
      >
        <option value="">{loading ? "Se încarcă..." : "Selectează județul"}</option>
        {counties.map((county) => (
          <option key={county} value={county}>
            {county}
          </option>
        ))}
      </select>

      {selectedCounty && (
        <>
          <label htmlFor="localitySelect">Localitatea</label>
          <select
            id="localitySelect"
            value={selectedLocality}
            onChange={(e) => {
              setSelectedLocality(e.target.value);
              setSelectedSchoolId("");
              setSelectedSchool(null);
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
          <label htmlFor="schoolSelect">Școala</label>
          <select
            id="schoolSelect"
            value={selectedSchoolId}
            onChange={(e) => {
              const school = schools.find((s) => s.id === e.target.value) || null;
              setSelectedSchoolId(school ? school.id : "");
              setSelectedSchool(school);
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
