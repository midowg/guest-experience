"use client";

import { Lock, MessageSquareDashed } from "lucide-react";
import { useLang, useT } from "@/components/main-wam/i18n";
import { ScreenContent } from "@/components/main-wam/shell";
import { EmptyState } from "@/components/main-wam/ui";
import { when } from "@/lib/main-wam/modul/awards";
import type { SilentView } from "@/lib/main-wam/modul/silent";
import { number } from "@/lib/main-wam/i18n";
import { Result } from "../Result";
import css from "../modul.module.css";

const counted = (count: number) => `${count.toLocaleString("id-ID")} masukan terkumpul.`;

/** T03 Silent Meeting ditutup: how many came in (only from 5 feedbacks of 5 people). */
export function SilentClosed({ count }: { count: number | null }) {
  const t = useT();
  const { lang } = useLang();
  return <div className={css.fill}>
    <ScreenContent className={css.grow}>
      <Result center headline icon={<Lock />} title={t("silent.closed")} body={count !== null ? t("silent.collected", { n: number(lang, count) }) : undefined} />
    </ScreenContent>
  </div>;
}

/** T03__status Belum dibuka: when it opens (its session's start, or when panitia opens it). */
export function SilentNotYet({ view, now }: { view: SilentView; now: Date }) {
  const t = useT();
  const { lang } = useLang();
  return <div className={css.fill}>
    <ScreenContent className={css.grow}>
      <Result center headline icon={<Lock />} title={t("silent.notYet")} sub={t("silent.opensAt", { when: when(view.session.startsAt, now, lang) })} />
    </ScreenContent>
  </div>;
}

/** The BOD do not send: they see only whether it is closed. Never a count while open. */
export function SilentForBod({ view, count }: { view: SilentView; count: number | null }) {
  const closed = view.state === "tutup";
  return <div className={css.fill}>
    <ScreenContent className={css.grow}>
      <Result center headline icon={<Lock />} title={closed ? "Sudah ditutup" : "Untuk peserta"}
        body={closed ? (count !== null ? counted(count) : undefined) : "Peserta mengirim masukan tanpa nama."} />
    </ScreenContent>
  </div>;
}

/** No Silent Meeting prepared (or not for this session). */
export function SilentNone() {
  const t = useT();
  return <ScreenContent>
    <EmptyState icon={<MessageSquareDashed />} title={t("silent.noneTitle")}>{t("silent.noneBody")}</EmptyState>
  </ScreenContent>;
}
