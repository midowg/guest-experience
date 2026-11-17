import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { MainWamShell } from "@/components/main-wam/shell";
import { mainWamGate } from "@/lib/main-wam/access";
import { homeGreeting } from "@/lib/main-wam/greeting";
import { unreadCount } from "@/lib/server/pra-wam/announcements";
import { readMainWamSettings } from "@/lib/server/main-wam/settings";
import { mainWamViewer } from "@/lib/server/main-wam/viewer";

/*
 * Every signed-in Main WAM screen shares one frame (the UI kit's MainWamShell: top bar, the four
 * tabs, toasts), drawn here once and kept while the screens under it change; each screen has its
 * own loading.tsx inside it. What the frame draws comes from the address (src/lib/main-wam/screen.ts).
 *
 * The gate is here too, so nobody Main WAM is not on for gets a frame (404), but it is not the only
 * one: a layout does not re-run on navigation, so every page calls requireMainWamPage itself (and
 * a test checks they do). Nobody signed in: no frame, and the page sends them to sign in, coming
 * back to the exact screen (a QR's address, say).
 */
export default async function MainWamAppLayout({ children }: { children: ReactNode }) {
  const [settings, viewer] = await Promise.all([readMainWamSettings(), mainWamViewer()]);
  const gate = mainWamGate(settings.mode, viewer);
  if (gate.kind === "tutup") notFound();
  if (gate.kind === "login" || !viewer) return children;
  const unread = await unreadCount(viewer.id).catch(() => 0);
  return <MainWamShell greeting={homeGreeting(new Date(), viewer.name, settings.event)} unread={unread}>
    {children}
  </MainWamShell>;
}
