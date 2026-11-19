import styles from "./app-loading.module.css";

/*
 * An app's own loading screen (19 Nov 2026): while a page of WAM, Main WAM, Booking Kantor or the office
 * TV is fetched, the app's name on the app's own background and colours, instead of Journey's white page
 * with the blue ring. The background is there at once (no white flash); the name and the dots come in a
 * moment later, so a quick page never blinks. With reduced motion the dots stay still. WLM has its own
 * splash (components/wellbeing/WlmSplash).
 */
export type AppTone = "wam" | "main-wam" | "booking" | "tv";

export function AppLoading({ tone, name, label = "Memuat halaman" }: { tone: AppTone; name: string; label?: string }) {
  return <div className={styles.wrap} data-tone={tone} role="status" aria-live="polite">
    <span className={styles.name} aria-hidden="true">{name}</span>
    <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>
    <span className="sr-only">{label}</span>
  </div>;
}
