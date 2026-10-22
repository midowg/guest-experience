import { Field } from "@/components/ui";
import type { EditorKit } from "@/components/admin/editor/kit";
import { eventTimezones, timezoneInfo, zoneOf } from "@/lib/timezones";
import styles from "@/components/admin/admin.module.css";

export function ScheduleBlock({ kit, onTimezone }: { kit: EditorKit; onTimezone: (zone: string) => void }) {
  const { event, time, tz } = kit;
  return <div className="stack">
    <Field name="timezone" label="Zona waktu" hint={timezoneInfo[zoneOf(event.timezone)].example}>
      <select id="timezone" className="input" value={zoneOf(event.timezone)} onChange={e => onTimezone(e.target.value)} aria-describedby="timezone-hint">
        {eventTimezones.map(zone => <option key={zone} value={zone}>{timezoneInfo[zone].label} · {timezoneInfo[zone].name} (UTC{timezoneInfo[zone].offset})</option>)}
      </select>
    </Field>
    <div className={styles.grid}>{time("starts_at", `Mulai (${tz})`)}{time("ends_at", `Selesai (${tz})`, "Opsional bila waktu selesai belum ditentukan.")}</div>
    <p className="muted">Semua waktu acara, rundown, batas RSVP, dan survei memakai zona ini. Mengganti zona mempertahankan jam yang sudah diketik.</p>
  </div>;
}
