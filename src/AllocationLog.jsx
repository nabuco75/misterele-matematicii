// Statistica repartizării (casete + rezumat) și jurnalul repartizărilor salvate.
import React, { useState } from "react";
import styles from "./AllocationLog.module.css";
import { ALLOCATION_TYPES, formatWhen } from "./allocationStore";

export function AllocationStatsView({ stats }) {
  const lastFree = stats.lastSeats - stats.lastCount;
  const free = stats.freeUsed + stats.freeEmpty;
  return (
    <div className={styles.stats}>
      <div className={styles.stat}>
        <span className={styles.icon}>🧑‍🎓</span>
        <span className={styles.value}>{stats.placed}</span>
        <span className={styles.label}>elevi repartizați</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.icon}>🚪</span>
        <span className={styles.value}>{stats.roomsUsed}</span>
        <span className={styles.label}>{stats.roomsUsed === 1 ? "sală folosită" : "săli folosite"}</span>
      </div>
      <div className={`${styles.stat} ${lastFree > 0 ? styles.ok : lastFree < 0 ? styles.bad : ""}`}>
        <span className={styles.icon}>🏁</span>
        <span className={styles.value}>
          {lastFree > 0 ? `${lastFree} libere` : lastFree < 0 ? `${-lastFree} peste` : "plină"}
        </span>
        <span className={styles.label}>
          ultima sală: <b>{stats.lastRoom}</b> ({stats.lastCount} / {stats.lastSeats})
        </span>
      </div>
      <div className={styles.stat}>
        <span className={styles.icon}>🪑</span>
        <span className={styles.value}>{stats.emptyRooms.length}</span>
        <span className={styles.label}>
          {stats.emptyRooms.length === 1 ? "sală liberă" : "săli libere"}
          {stats.emptyRooms.length > 0 && ` (${stats.freeEmpty} locuri)`}
        </span>
      </div>
      <p className={styles.text}>
        Elevii au fost repartizați în <b>{stats.roomsUsed}</b> {stats.roomsUsed === 1 ? "sală" : "săli"}.{" "}
        {lastFree > 0
          ? `Ultima sală (${stats.lastRoom}) mai are ${lastFree} ${lastFree === 1 ? "loc liber" : "locuri libere"}.`
          : lastFree === 0
          ? `Ultima sală (${stats.lastRoom}) este plină.`
          : `Ultima sală (${stats.lastRoom}) are ${-lastFree} elevi peste numărul de locuri.`}{" "}
        {stats.emptyRooms.length > 0
          ? `Mai ${
              stats.emptyRooms.length === 1 ? "este liberă o sală" : `sunt ${stats.emptyRooms.length} săli libere`
            }: ${stats.emptyRooms.join(", ")}.`
          : "Nu mai este nicio sală liberă."}{" "}
        În total mai sunt <b>{free}</b> locuri libere
        {stats.freeUsed > 0 && ` (${stats.freeUsed} în sălile folosite)`}.
        {stats.over?.length > 0 && ` ⚠️ Peste capacitate: ${stats.over.join(", ")}.`}
      </p>
    </div>
  );
}

// cartea „Ultima repartizare” + elevii veniți după ea + istoric
export function AllocationLogCard({ saved, newCount, onPlaceNew, onRegenerate, onOpen }) {
  const [showHistory, setShowHistory] = useState(false);
  if (!saved?.last) {
    return (
      <div className={styles.card}>
        <h3 className={styles.title}>🗂️ Jurnalul repartizărilor</h3>
        <p className={styles.muted}>Nu a fost salvată încă nicio repartizare.</p>
        {onOpen && (
          <button className={styles.primary} onClick={onOpen}>
            🎲 Mergi la repartizare
          </button>
        )}
      </div>
    );
  }
  const { last, history } = saved;
  return (
    <div className={styles.card}>
      <h3 className={styles.title}>🗂️ Ultima repartizare</h3>
      <p className={styles.when}>
        Elevii au fost repartizați ultima dată pe <b>{formatWhen(last.at)}</b>
        <span className={styles.badge}>{ALLOCATION_TYPES[last.type] || last.type}</span>
        {last.type === "elevi-noi" && last.added > 0 && (
          <span className={styles.muted}> (+{last.added} elevi)</span>
        )}
      </p>
      <AllocationStatsView stats={last} />

      {newCount > 0 ? (
        <div className={styles.newBox}>
          <p>
            🆕 De la momentul repartizării au fost înscriși <b>{newCount}</b>{" "}
            {newCount === 1 ? "elev nou, care nu are" : "elevi noi, care nu au"} încă sală.
          </p>
          <div className={styles.actions}>
            {onPlaceNew && (
              <button className={styles.primary} onClick={onPlaceNew}>
                ➕ Repartizează elevii noi în ultima sală
              </button>
            )}
            {onRegenerate && (
              <button className={styles.secondary} onClick={onRegenerate}>
                🎲 Generează o nouă repartizare (se păstrează doar codurile)
              </button>
            )}
            {onOpen && (
              <button className={styles.primary} onClick={onOpen}>
                Mergi la repartizare →
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className={styles.allGood}>✅ Toți elevii înscriși au sală. Nu a mai venit nimeni de la ultima repartizare.</p>
      )}

      {history.length > 1 && (
        <div className={styles.history}>
          <button className={styles.link} onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? "▾" : "▸"} Istoric ({history.length} repartizări)
          </button>
          {showHistory && (
            <ul>
              {history.map((h) => (
                <li key={h.at}>
                  <b>{formatWhen(h.at)}</b> — {ALLOCATION_TYPES[h.type] || h.type}
                  {h.type === "elevi-noi" && h.added > 0 && ` (+${h.added})`}: {h.placed} elevi în {h.roomsUsed}{" "}
                  săli, ultima {h.lastRoom} ({h.lastCount}/{h.lastSeats})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
