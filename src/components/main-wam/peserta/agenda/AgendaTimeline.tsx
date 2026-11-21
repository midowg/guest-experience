"use client";

import { Bus, Check, ChevronRight, Coffee, ListChecks, Lock, MapPin, Presentation, Utensils, CircleX, type LucideIcon } from "lucide-react";
import type { AgendaKind, AgendaRow } from "@/lib/main-wam/peserta/agenda";
import { mainWamPath } from "@/lib/routes";
import { useT } from "@/components/main-wam/i18n";
import { Pill, Pressable, SrOnly, StatusPill } from "@/components/main-wam/ui";
import css from "./agenda.module.css";

/** The icon of each kind of entry: on the timeline and, larger, at the top of Detail sesi. */
export const KIND_ICONS: Record<AgendaKind, LucideIcon> = { sesi: Presentation, makan: Utensils, perjalanan: Bus, jeda: Coffee };

/**
 * One day of the agenda as a timeline (the handbook's rundown, in Main WAM's words): the hours on the
 * left, a vertical rail whose node carries the kind of entry (a check once done), and a card with
 * title, place and status. The running one is lit with "Sedang berlangsung" and a ringed node, the
 * next one marked "Berikutnya", past ones softened, a cancelled one struck through and not openable.
 * Meals and breaks are light rows (no box) so the sessions stand out. Under 300 px (zoom 200 %) the
 * hours sit on a line of their own and the rail steps aside.
 */
export function AgendaTimeline({ rows, label }: { rows: AgendaRow[]; label: string }) {
  const t = useT();
  return <ol className={css.timeline} aria-label={label}>
    {rows.map(row => {
      const cancelled = row.status === "cancelled";
      const light = row.kind === "makan" || row.kind === "jeda";
      const Icon = cancelled ? CircleX : row.status === "done" ? Check : KIND_ICONS[row.kind];
      return <li key={row.id} className={css.item} data-status={row.status} data-kind={row.kind} data-light={light || undefined} data-next={row.next || undefined}>
        <Pressable href={cancelled ? undefined : mainWamPath.session(row.id)} className={css.row}>
          <span className={css.time}>
            <span className={css.start}>{row.start}</span>
            {row.end && <span className={css.end}><SrOnly>{t("ui.untilSr")}</SrOnly>{row.end}</span>}
          </span>
          <span className={css.rail} aria-hidden><span className={css.node}><Icon /></span></span>
          <span className={css.card}>
            <span className={css.main}>
              <span className={css.title}>{row.title}</span>
              {row.place && <span className={css.place}><MapPin aria-hidden /><span>{row.place}</span></span>}
              {(row.status === "live" || row.next || cancelled || row.changed || row.ceklis || row.ceklisFirst) && <span className={css.pills}>
                {row.status === "live" && <StatusPill status="live" />}
                {row.next && <StatusPill status="next" />}
                {cancelled && <StatusPill status="cancelled" />}
                {row.changed && <StatusPill status="changed" />}
                {row.ceklis && <Pill tone={row.ceklis.complete ? "success" : "primary"} icon={<ListChecks />}>{t("ceklis.chip", { n: `${row.ceklis.done}/${row.ceklis.total}` })}</Pill>}
                {row.ceklisFirst && <Pill tone="warning" icon={<Lock />}>{t("ceklis.chipFirst")}</Pill>}
              </span>}
              {row.status === "done" && <SrOnly>{t("pill.done")}</SrOnly>}
            </span>
            {!cancelled && <ChevronRight aria-hidden className={css.chevron} />}
          </span>
        </Pressable>
      </li>;
    })}
  </ol>;
}
