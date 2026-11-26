import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { MomenQueueRunner } from "@/components/main-wam/momen/upload/QueueRunner";
import { AbsenQueue } from "@/components/main-wam/modul/absen/AbsenQueue";
import { SessionSheetPending } from "@/components/main-wam/peserta/agenda/SessionSheet";
import { MainWamShell, SignInFirst } from "@/components/main-wam/shell";
import { mainWamGate, mainWamRole, showsCommitteeTab } from "@/lib/main-wam/access";
import { homeGreeting } from "@/lib/main-wam/greeting";
import { QR_ABSEN_VISIBLE, moduleOn } from "@/lib/main-wam/modules";
import { unreadCount } from "@/lib/server/pra-wam/announcements";
import { readLang } from "@/lib/server/main-wam/lang";
import { readMainWamSettings } from "@/lib/server/main-wam/settings";
import { mainWamViewer } from "@/lib/server/main-wam/viewer";

/*
 * Every signed-in Main WAM screen shares one frame (the UI kit's MainWamShell: top bar, the four
 * tabs (five for panitia), toasts), drawn here once and kept while the screens under it change; each screen has its
 * own loading.tsx inside it, and error.tsx here catches any screen without its own (in the frame).
 * What the frame draws comes from the address (src/lib/main-wam/screen.ts).
 *
 * The gate is here too, so nobody Main WAM is not on for gets a frame (404), but it is not the only
 * one: a layout does not re-run on navigation, so every page calls requireMainWamPage itself (and
 * a test checks they do). Nobody signed in: in mode semua the page sends them to Main WAM's
 * sign-in; otherwise nothing of Main WAM is drawn, not even a loading screen (audit M6), and
 * SignInFirst takes them to WAM's sign-in, coming back to the exact screen (a QR's address, say).
 */
export default async function MainWamAppLayout({ children, sheet }: { children: ReactNode; /** Detail sesi opened from inside the app: a sheet over the screen that stays (@sheet, intercepting route). */ sheet: ReactNode }) {
  const read = readMainWamSettings();
  const [settings, viewer] = await Promise.all([read, mainWamViewer(read)]);
  const gate = mainWamGate(settings.mode, viewer);
  if (gate.kind === "tutup") notFound();
  if (gate.kind === "login" || !viewer) return gate.kind === "login" && gate.page === "main" ? children : <SignInFirst />;
  const [unread, lang] = await Promise.all([unreadCount(viewer.id).catch(() => 0), readLang()]);
  return <MainWamShell greeting={homeGreeting(new Date(), viewer.name, settings.event, mainWamRole(viewer), lang)} unread={unread} committee={showsCommitteeTab(viewer)} demo={settings.moduleConfig.demo}>
    {children}
    {sheet}
    <SessionSheetPending />
    {/* Check-ins scanned offline go out from any screen once the phone is back online (agen D); only while the QR check-in is shown (QR_ABSEN_VISIBLE, KONTRAK 41). */}
    {moduleOn(settings.modules, "absen") && QR_ABSEN_VISIBLE && <AbsenQueue />}
    {/* Photos taken offline go out (and say "2 foto terkirim") from any screen (agen B, U03). */}
    <MomenQueueRunner />
  </MainWamShell>;
}
