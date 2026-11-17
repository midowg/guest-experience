import { Lock, MessageSquareDashed } from "lucide-react";
import { ScreenContent } from "@/components/main-wam/shell";
import { ActionBar, Button, EmptyState } from "@/components/main-wam/ui";
import { when } from "@/lib/main-wam/modul/awards";
import type { SilentView } from "@/lib/main-wam/modul/silent";
import { mainWamPath } from "@/lib/routes";
import { Result } from "../Result";
import css from "../modul.module.css";

const counted = (count: number) => `${count.toLocaleString("id-ID")} masukan terkumpul.`;

/** T03 Silent Meeting ditutup: how many came in (only from 5 feedbacks of 5 people), and where they go. */
export function SilentClosed({ count }: { count: number | null }) {
  return <div className={css.fill}>
    <ScreenContent className={css.grow}>
      <Result center headline icon={<Lock />} title="Sudah ditutup" body={count !== null ? <>{counted(count)}<br />Rekap dikirim ke BOD.</> : "Rekap dikirim ke BOD."} />
    </ScreenContent>
  </div>;
}

/** T03__status Belum dibuka: when it opens (its session's start, or when panitia opens it). */
export function SilentNotYet({ view, now }: { view: SilentView; now: Date }) {
  return <div className={css.fill}>
    <ScreenContent className={css.grow}>
      <Result center headline icon={<Lock />} title="Belum dibuka" sub={`Dibuka ${when(view.session.startsAt, now)}.`} />
    </ScreenContent>
  </div>;
}

/** The BOD do not send: they read the recap once it is closed. Never a count while open. */
export function SilentForBod({ view, count }: { view: SilentView; count: number | null }) {
  const closed = view.state === "tutup";
  return <div className={css.fill}>
    <ScreenContent className={css.grow}>
      <Result center headline icon={<Lock />} title={closed ? "Sudah ditutup" : "Untuk peserta"}
        body={closed ? (count !== null ? counted(count) : undefined) : "Peserta mengirim masukan tanpa nama. Rekap tampil setelah ditutup."} />
    </ScreenContent>
    {closed && <ActionBar><Button block href={mainWamPath.silentRecap}>Lihat rekap</Button></ActionBar>}
  </div>;
}

/** No Silent Meeting prepared (or not for this session). */
export function SilentNone() {
  return <ScreenContent>
    <EmptyState icon={<MessageSquareDashed />} title="Belum ada Silent Meeting">Silent Meeting tampil di sini saat sesinya dibuka.</EmptyState>
  </ScreenContent>;
}
