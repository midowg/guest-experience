"use client";

import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { localDay } from "@/lib/event-phase";
import { reminderChoices, type CalendarScope } from "@/lib/ics";
import type { EventRecord } from "@/lib/types";
import { GuestSheet } from "./GuestForms";
import { useWording } from "./language";
import styles from "./guest.module.css";
import { calendarPath } from "@/lib/routes";

/**
 * "Add to calendar": the guest picks a reminder (and, on a day of a multi-day trip, today only)
 * and the phone opens the .ics file. The file links to the general page, never a personal link.
 */
export function CalendarButton({ event, now }: { event: EventRecord; now: number | null }) {
  const { t } = useWording();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<CalendarScope>("all");
  const [remind, setRemind] = useState<number>(30);
  if (!event.starts_at) return null;
  const days = new Set(event.agenda.filter(item => item.starts_at).map(item => localDay(item.starts_at, event.timezone)));
  const today = now === null ? null : localDay(now, event.timezone);
  const canToday = days.size > 1 && !!today && days.has(today);
  const chosen = canToday ? scope : "all";
  const href = calendarPath(event, { ...(chosen === "today" ? { cakupan: "hari-ini" } : {}), ingat: String(remind) });
  return <>
    <button type="button" className={styles.calendarButton} onClick={() => setOpen(true)}><CalendarPlus size={18} aria-hidden="true" /> {t("calendar.add")}</button>
    {open && <GuestSheet title={t("calendar.title")} onClose={() => setOpen(false)} footer={<ButtonLink href={href} download onClick={() => setOpen(false)}>{t("calendar.title")}</ButtonLink>}>
      <div className={styles.sheetStack}>
        <p>{t("calendar.sub")}</p>
        {canToday && <fieldset className={styles.optionCards}>
          <legend className={styles.sheetLegend}>{t("calendar.scope")}</legend>
          {(["all", "today"] as const).map(value => <label key={value} className={`${styles.optionCard} ${scope === value ? styles.optionCardOn : ""}`.trimEnd()}>
            <input type="radio" name="calendar-scope" checked={scope === value} onChange={() => setScope(value)} />
            <span>{t(value === "all" ? "calendar.all" : "calendar.today")}</span>
          </label>)}
        </fieldset>}
        <fieldset className={styles.optionCards}>
          <legend className={styles.sheetLegend}>{t("calendar.reminder")}</legend>
          {reminderChoices.map(minutes => <label key={minutes} className={`${styles.optionCard} ${remind === minutes ? styles.optionCardOn : ""}`.trimEnd()}>
            <input type="radio" name="calendar-remind" checked={remind === minutes} onChange={() => setRemind(minutes)} />
            <span>{t("calendar.remind", { minutes })}</span>
          </label>)}
        </fieldset>
        <p className={styles.sheetNote}>{t("calendar.changes")}</p>
      </div>
    </GuestSheet>}
  </>;
}
