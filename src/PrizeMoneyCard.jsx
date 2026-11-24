// Premiile în bani (Asociația „Arcașii lui Ștefan”): sumele pe premiu + tabelul de descărcat (PDF / Excel).
// Își încarcă singur notele și premiile tuturor elevilor (indiferent de filtrele de la Notare).
import React, { useEffect, useMemo, useState } from "react";
import {
  MAX_PRIZE,
  PRIZE_AMOUNTS,
  PRIZE_KEYS,
  PRIZE_LABEL,
  PRIZE_PRESETS,
  SPONSOR,
  exportPrizesExcel,
  isDefaultAmounts,
  loadPrizeAmounts,
  normalizePrizeAmount,
  printPrizesPdf,
  savePrizeAmounts,
  prizeRows,
  prizeSummary,
} from "./prizeMoney";
import { loadResults } from "./reportLists";
import styles from "./PrizeMoneyCard.module.css";

export default function PrizeMoneyCard({ header }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await loadResults());
    } catch (err) {
      console.error("Eroare la încărcarea premiilor:", err);
      setError(String(err?.message || "").startsWith("Codurile") ? err.message : "Premiile nu au putut fi citite. Încercați din nou.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  // sumele pe premiu se aleg din dropdown și se salvează în baza de date (comune tuturor
  // calculatoarelor); se scriu doar când le schimbă cineva aici, nu la deschiderea paginii
  const [prizeAmounts, setPrizeAmountsState] = useState(loadPrizeAmounts);
  const [customPrize, setCustomPrize] = useState({}); // premiu → text tastat la „Altă sumă…”
  const setPrizeAmounts = (update) =>
    setPrizeAmountsState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      savePrizeAmounts(next);
      return next;
    });
  const setPrizeAmount = (key, value) => setPrizeAmounts((a) => ({ ...a, [key]: value }));
  const pickPrizeAmount = (key, raw) => {
    if (raw === "custom") {
      setCustomPrize((c) => ({ ...c, [key]: String(prizeAmounts[key] || "") }));
      return;
    }
    setCustomPrize((c) => {
      const rest = { ...c };
      delete rest[key];
      return rest;
    });
    setPrizeAmount(key, Number(raw));
  };
  const typeCustomPrize = (key, text) => {
    const clean = text.replace(/\D/g, "").slice(0, String(MAX_PRIZE).length);
    setCustomPrize((c) => ({ ...c, [key]: clean }));
    const n = normalizePrizeAmount(clean);
    if (clean !== "" && n !== null) setPrizeAmount(key, n);
  };
  const resetPrizeAmounts = () => {
    setCustomPrize({});
    setPrizeAmounts({ ...PRIZE_AMOUNTS });
  };
  // câți elevi (prezenți) au fiecare premiu, indiferent dacă premiul primește bani
  const awardCounts = useMemo(() => {
    const c = {};
    rows.forEach((r) => {
      if (!r.absent && r.premiu) c[r.premiu] = (c[r.premiu] || 0) + 1;
    });
    return c;
  }, [rows]);
  const prizeInfo = useMemo(() => prizeSummary(prizeRows(rows, prizeAmounts), prizeAmounts), [rows, prizeAmounts]);
  const doPrizes = async (kind) => {
    const half = Object.entries(customPrize).find(([, t]) => t === "" || normalizePrizeAmount(t) === null);
    if (half) {
      window.alert(`Completați suma pentru ${PRIZE_LABEL[half[0]]} (sau alegeți o valoare din listă).`);
      return;
    }
    if (prizeInfo.count === 0) {
      window.alert(
        PRIZE_KEYS.some((k) => prizeAmounts[k] > 0)
          ? "Nu există încă premianți cu sumă de primit (I, II, III, M1, M2, M3). Premiile se aleg la Notare."
          : "Toate premiile au suma 0 lei — alegeți sumele din listă."
      );
      return;
    }
    // premiile pot fi schimbate între timp la Notare (alt calculator): recitim înainte de export
    let fresh = rows;
    try {
      fresh = await loadResults();
      setRows(fresh);
    } catch (err) {
      console.error("Premiile nu au putut fi recitite:", err);
      if (!window.confirm("Premiile nu au putut fi recitite din baza de date. Exportați datele afișate?")) return;
    }
    if (kind === "excel") exportPrizesExcel(fresh, header, prizeAmounts);
    else printPrizesPdf(fresh, header, prizeAmounts);
  };

  return (
    <div className={styles.prizeCard}>
      <div className={styles.prizeHead}>
        <span className={styles.prizeIcon}>💰</span>
        <div>
          <b>Premii în bani — {SPONSOR}</b>
          <small>
            Alegeți suma pentru fiecare premiu — tabelul preia premianții de la Notare și pune sumele · fără mențiunile
            SSMR · toți elevii, indiferent de filtre
          </small>
        </div>
        <div className={styles.prizeTotal}>
          <b>{loading ? "…" : `${prizeInfo.total.toLocaleString("ro-RO")} lei`}</b>
          <small>
            {loading ? "se încarcă" : `${prizeInfo.count} premianți`} ·{" "}
            <button className={styles.prizeRefresh} onClick={load} disabled={loading} title="Recitește premiile de la Notare">
              🔄 actualizează
            </button>
          </small>
        </div>
      </div>
      {error && <p className={styles.prizeError}>⚠️ {error}</p>}
      <div className={styles.prizeAmounts}>
        {PRIZE_KEYS.map((k) => {
          const amount = prizeAmounts[k];
          const custom = k in customPrize;
          const presets = PRIZE_PRESETS.includes(amount) ? PRIZE_PRESETS : [...PRIZE_PRESETS, amount].sort((a, b) => a - b);
          const count = awardCounts[k] || 0;
          return (
            <div key={k} className={`${styles.prizeAmount} ${amount === 0 ? styles.prizeAmountOff : ""}`}>
              <label htmlFor={`prize-${k}`}>{PRIZE_LABEL[k]}</label>
              <select
                id={`prize-${k}`}
                value={custom ? "custom" : String(amount)}
                onChange={(e) => pickPrizeAmount(k, e.target.value)}
              >
                {presets.map((v) => (
                  <option key={v} value={v}>
                    {v === 0 ? "Fără bani (0 lei)" : `${v.toLocaleString("ro-RO")} lei`}
                  </option>
                ))}
                <option value="custom">Altă sumă…</option>
              </select>
              {custom && (
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  placeholder="Suma în lei"
                  aria-label={`Suma pentru ${PRIZE_LABEL[k]}, în lei`}
                  value={customPrize[k]}
                  onChange={(e) => typeCustomPrize(k, e.target.value)}
                  onBlur={() => {
                    const n = normalizePrizeAmount(customPrize[k]);
                    if (customPrize[k] !== "" && n !== null && PRIZE_PRESETS.includes(n)) pickPrizeAmount(k, String(n));
                  }}
                />
              )}
              <small>
                {count} {count === 1 ? "elev" : "elevi"}
                {amount > 0 && count > 0 && <> · {(count * amount).toLocaleString("ro-RO")} lei</>}
              </small>
            </div>
          );
        })}
      </div>
      {!isDefaultAmounts(prizeAmounts) && (
        <button className={styles.prizeReset} onClick={resetPrizeAmounts}>
          ↺ Revino la sumele implicite ({PRIZE_KEYS.map((k) => PRIZE_AMOUNTS[k]).join(" / ")} lei)
        </button>
      )}
      <div className={styles.prizeBtns}>
        <button onClick={() => doPrizes("pdf")} disabled={loading}>
          📄 Tabel premii (PDF)
        </button>
        <button onClick={() => doPrizes("excel")} disabled={loading}>
          📥 Tabel premii (Excel)
        </button>
      </div>
    </div>
  );
}
