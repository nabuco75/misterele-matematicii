// Fundalul „Aurora” pentru paginile etapelor (Săli, Repartizare, Coduri, Tipărire, Notare).
// Doar aspect: învelește pagina și pune în spate cerul de noapte cu luminile care plutesc.
// Clasa globală „aurora-stage” permite fiecărei pagini să-și rafineze stilurile în acest context.
import styles from "./Aurora.module.css";

export default function AuroraStage({ children }) {
  return (
    <div className={`aurora-stage ${styles.stage}`}>
      <div className={styles.bg} aria-hidden="true">
        <span className={styles.blob1} />
        <span className={styles.blob2} />
        <span className={styles.blob3} />
        <span className={styles.grain} />
      </div>
      {children}
    </div>
  );
}
