import styles from "@/components/pra-wam/pra-wam.module.css";

/** WAM's own loading screen in the app's colours (light or dark), instead of Journey's white one. */
export default function WamLoading() {
  return <div className={`${styles.app} ${styles.loading}`} role="status" aria-live="polite">
    <span className={styles.spinner} aria-hidden />
    <span>Memuat…</span>
  </div>;
}
