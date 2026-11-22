"use client";

import { Bus, CalendarDays, ListChecks, Lock, QrCode, Sparkles, Trophy, Utensils, type LucideIcon } from "lucide-react";
import type { AgendaKind, AgendaRow } from "@/lib/main-wam/peserta/agenda";
import { mainWamPath } from "@/lib/routes";
import { useT } from "@/components/main-wam/i18n";
import { Pressable, SrOnly, StatusPill, cx } from "@/components/main-wam/ui";
import css from "./agenda.module.css";

/** The icon of each kind of entry: in its tag on the timeline and, larger, at the top of Detail sesi (prototipe TAGS). */
export const KIND_ICONS: Record<AgendaKind, LucideIcon> = { sesi: CalendarDays, makan: Utensils, perjalanan: Bus, jeda: Sparkles };

/**
 * One day of the agenda as a timeline (prototipe .ags/.agr): the start hour in big Barlow on the left, a
 * rail whose node is a ring (blue), filled green once done and a gold glowing dot while it runs, then the
 * title, the place and small tags (kind, "Wajib absen", "Ceklis 0/2", "Ceklis dulu"). The running one
 * also says "Sedang berlangsung", the next one "Berikutnya", a moved one "Jam berubah"; past ones are
 * softened, a cancelled one is struck through and not openable. Under 300 px (zoom 200 %) the hour sits on
 * a line of its own and the rail steps aside.
 */
export function AgendaTimeline({ rows, label }: { rows: AgendaRow[]; label: string }) {
  const t = useT();
  return <ol className={css.timeline} aria-label={label}>
    {rows.map(row => {
      const cancelled = row.status === "cancelled";
      const KindIcon = KIND_ICONS[row.kind];
      return <li key={row.id} className={css.item} data-status={row.status} data-kind={row.kind} data-next={row.next || undefined}>
        <Pressable href={cancelled ? undefined : mainWamPath.session(row.id)} className={css.row}>
          <span className={css.time}>
            {row.start}
            {row.end && <SrOnly>{t("ui.untilSr")}{row.end}</SrOnly>}
          </span>
          <span className={css.node} aria-hidden />
          <span className={css.body}>
            <span className={css.title}>{row.title}</span>
            {row.place && <span className={css.place}>{row.place}</span>}
            <span className={css.tags}>
              {row.status === "live" && <StatusPill status="live" className={css.status} />}
              {row.next && <StatusPill status="next" className={css.status} />}
              {cancelled && <StatusPill status="cancelled" className={css.status} />}
              {row.changed && <StatusPill status="changed" className={css.status} />}
              <span className={css.kt}><KindIcon aria-hidden />{t(`peserta.session.kind.${row.kind}`)}</span>
              {row.kuis && <span className={cx(css.kt, css.ktQuiz)}><Trophy aria-hidden />{t("peserta.agenda.kuis")}</span>}
              {row.absen && <span className={cx(css.kt, row.absen === "wajib" && css.ktGold)}><QrCode aria-hidden />{t(row.absen === "wajib" ? "peserta.agenda.absenRequired" : "peserta.agenda.absen")}</span>}
              {row.ceklis && <span className={cx(css.kt, css.ktGold)}><ListChecks aria-hidden />{t("ceklis.chip", { n: `${row.ceklis.done}/${row.ceklis.total}` })}</span>}
              {row.misi ? <span className={cx(css.kt, css.ktGold)}><Trophy aria-hidden />{t("peserta.agenda.misi", { n: row.misi })}</span> : null}
              {row.ceklisFirst && <span className={css.kt}><Lock aria-hidden />{t("ceklis.chipFirst")}</span>}
            </span>
            {row.status === "done" && <SrOnly>{t("pill.done")}</SrOnly>}
          </span>
        </Pressable>
      </li>;
    })}
  </ol>;
}
