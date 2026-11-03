import type { ReactNode } from "react";
import styles from "./pra-wam.module.css";

// Plain markup, usable from server pages and client forms alike (PraWamShell itself reads the server).

/** A screen's title, as in Penpot: Lora in blue, an optional line above and below, and actions. */
export function ScreenHead({ title, eyebrow, lead, actions }: { title: string; eyebrow?: string; lead?: ReactNode; actions?: ReactNode }) {
  return <div className={styles.head}>
    <div>{eyebrow && <p className={styles.kicker}>{eyebrow}</p>}<h1>{title}</h1>{lead && <p>{lead}</p>}</div>
    {actions && <div className={styles.actions}>{actions}</div>}
  </div>;
}

/** A detail screen's top row: back arrow and a short title, as in Penpot's "Detail sesi". */
export function BackRow({ href, title }: { href: string; title: string }) {
  return <div className={styles.backRow}>
    <a className={styles.back} href={href} aria-label="Kembali"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 18-6-6 6-6" /></svg></a>
    <strong>{title}</strong>
  </div>;
}
