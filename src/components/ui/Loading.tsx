import styles from "./loading.module.css";

/**
 * Shown while a page is being fetched. The ring is decorative — the text is what a screen
 * reader announces, so it names the thing being loaded rather than saying "loading".
 */
export function Loading({ label = "Memuat halaman…" }: { label?: string }) {
  return <div className={styles.wrap} role="status" aria-live="polite">
    <span className={styles.ring} aria-hidden="true" />
    <p className={styles.label}>{label}</p>
  </div>;
}
