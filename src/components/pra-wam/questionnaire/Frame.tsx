import type { ReactNode } from "react";
import { ArrowLeft, Check } from "lucide-react";
import type { QSection } from "@/lib/pra-wam/questionnaire";
import { body, display } from "./font";
import styles from "./questionnaire.module.css";

// Plain markup, used by the questionnaire (client) and the read-only view (server) alike.

/** The full screen of the questionnaire in its own light, playful theme. */
export function QuestionnaireApp({ children }: { children: ReactNode }) {
  return <div className={`${display.variable} ${body.variable} ${styles.app}`}>{children}</div>;
}

export type Slot = { section: QSection; done: boolean };

/** One sticker slot per section: a tick once done, the number of the one in hand, else "?". */
export function Slots({ slots, current, popped }: { slots: Slot[]; current?: string; popped?: string | null }) {
  return <ol className={styles.slots} aria-label="Bagian kuesioner">
    {slots.map(({ section, done }, index) => {
      const now = section.id === current;
      const state = done ? "selesai" : now ? "sedang diisi" : "belum";
      return <li key={section.id} aria-label={`Bagian ${index + 1}, ${section.title}: ${state}`} aria-current={now ? "step" : undefined}
        className={`${styles.slot} ${done ? styles.got : now ? styles.now : ""} ${section.id === popped ? styles.pop : ""}`}>
        <span aria-hidden>{done ? <Check size={18} strokeWidth={3} /> : now ? index + 1 : "?"}</span>
      </li>;
    })}
  </ol>;
}

/** The top bar: Keluar to Beranda, the form's name, the slots and a status line. */
export function Top({ name, home, slots, current, popped, status, preview }: { name: string; home: string; slots: Slot[]; current?: string; popped?: string | null; status: ReactNode; preview?: boolean }) {
  return <header className={`${styles.wrap} ${styles.top}`}>
    <div className={styles.bar}>
      <a className={styles.exit} href={home}><ArrowLeft aria-hidden />Keluar</a>
      <span className={styles.formName}>{name}</span>
    </div>
    {preview && <p className={styles.preview} role="note">Pratinjau draf: hanya Admin WAM yang melihat. Jawaban di sini data uji.</p>}
    <Slots slots={slots} current={current} popped={popped} />
    <div className={styles.status}>{status}</div>
  </header>;
}

/** "Kamis, 5 November pukul 12.00", in Jakarta time. */
export const deadlineLabel = (iso: string) => {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" }).format(date);
  const time = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(date).replace(":", ".");
  return `${day} pukul ${time}`;
};
