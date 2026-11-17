import { Info } from "lucide-react";
import { ScreenContent } from "@/components/main-wam/shell";
import { ActionBar, Button } from "@/components/main-wam/ui";
import { Scanner } from "@/components/main-wam/modul/absen/Scanner";
import { Result } from "@/components/main-wam/modul/Result";
import { mainWamCan } from "@/lib/main-wam/access";
import { mainWamPath } from "@/lib/routes";
import { requireModulePage } from "@/lib/server/main-wam/gate";
import { openForMe } from "@/lib/server/main-wam/modul/absen";
import { panitiaContact } from "@/lib/server/main-wam/modul/contact";

export const dynamic = "force-dynamic";
export const metadata = { title: "Absen · WAM", robots: { index: false } };

/** A01 Scan QR absen (A05 when the camera is refused). Module Absen QR; BOD do not check in. */
export default async function ScanPage() {
  const { viewer, settings } = await requireModulePage("absen", mainWamPath.scan);
  if (!mainWamCan(viewer, "absen")) {
    return <>
      <ScreenContent><Result icon={<Info />} title="Tidak perlu absen" body="BOD tidak absen." /></ScreenContent>
      <ActionBar><Button block href={mainWamPath.home}>Selesai</Button></ActionBar>
    </>;
  }
  const open = await openForMe(viewer.id, new Date()).catch(() => null);
  const contact = await panitiaContact(settings, open?.session).catch(() => null);
  return <Scanner current={open ? { title: open.session.title, place: open.session.place, until: open.until } : null} contact={contact} />;
}
