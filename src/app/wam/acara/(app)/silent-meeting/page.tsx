import { SilentForm } from "@/components/main-wam/modul/silent/SilentForm";
import { SilentClosed, SilentForBod, SilentNone, SilentNotYet } from "@/components/main-wam/modul/silent/SilentStates";
import { Waiting } from "@/components/main-wam/modul/Waiting";
import { mainWamCan } from "@/lib/main-wam/access";
import { mainWamPath } from "@/lib/routes";
import { requireModulePage } from "@/lib/server/main-wam/gate";
import { sendsLeft, silentNow, silentShownCountOf } from "@/lib/server/main-wam/modul/silent";

export const dynamic = "force-dynamic";
export const metadata = { title: "Silent Meeting · WAM", robots: { index: false } };

const uuid = (value: unknown) => (typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : undefined);

/**
 * T01 dibuka (form) → T02 terkirim, T03 ditutup, T03__status belum dibuka. The open one, or the one
 * of ?sesi= (from Detail sesi). Module Silent Meeting; the BOD read the recap instead (B05). No count
 * while open; once closed, one only from 5 feedbacks of 5 people (audit H2).
 */
export default async function SilentMeetingPage({ searchParams }: { searchParams: Promise<{ sesi?: string | string[] }> }) {
  const sesi = uuid((await searchParams).sesi);
  const { viewer } = await requireModulePage("silent", mainWamPath.silentMeeting(sesi));
  const now = new Date();
  const { view, migrated } = await silentNow(now, sesi);
  if (!migrated) return <Waiting />;
  if (!view) return <SilentNone />;
  if (!mainWamCan(viewer, "silent-kirim")) return <SilentForBod view={view} count={await silentShownCountOf(view)} />;
  if (view.state === "belum") return <SilentNotYet view={view} now={now} />;
  if (view.state === "tutup") return <SilentClosed count={await silentShownCountOf(view)} />;
  return <SilentForm key={view.question.id} view={view} remaining={sendsLeft(view.question.id, viewer)} />;
}
