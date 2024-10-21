// src/components/ClassButtons.js
import React from "react";

function ClassButtons({ setSelectedClass }) {
  return (
    <div>
      <h3>Selectează Clasa</h3>
      <button onClick={() => setSelectedClass("a IV-a")}>Clasa a IV-a</button>
      <button onClick={() => setSelectedClass("a V-a")}>Clasa a V-a</button>
      <button onClick={() => setSelectedClass("a VI-a")}>Clasa a VI-a</button>
      <button onClick={() => setSelectedClass("a VII-a")}>Clasa a VII-a</button>
    </div>
  );
}

export default ClassButtons;
