import { Info } from "lucide-react";
import { ScreenContent } from "@/components/main-wam/shell";
import { ActionBar, Button } from "@/components/main-wam/ui";
import { Scanner } from "@/components/main-wam/modul/absen/Scanner";
import { Result } from "@/components/main-wam/modul/Result";
import { mainWamCan } from "@/lib/main-wam/access";
import { mainWamPath } from "@/lib/routes";
import { requireQrAbsenPage } from "@/lib/server/main-wam/gate";
import { serverT } from "@/lib/server/main-wam/lang";
import { openForMe } from "@/lib/server/main-wam/modul/absen";
import { panitiaContact } from "@/lib/server/main-wam/modul/contact";

export const dynamic = "force-dynamic";
export const metadata = { title: "Absen · WAM", robots: { index: false } };

/** A01 Scan QR absen (A05 when the camera is refused). Hidden (404) while QR_ABSEN_VISIBLE is false (KONTRAK 41); BOD do not check in. */
export default async function ScanPage() {
  const { viewer, settings } = await requireQrAbsenPage(mainWamPath.scan);
  if (!mainWamCan(viewer, "absen")) {
    const t = await serverT();
    return <>
      <ScreenContent><Result icon={<Info />} title={t("absen.notNeeded")} body={t("absen.bodNoCheckIn")} /></ScreenContent>
      <ActionBar><Button block href={mainWamPath.home}>{t("absen.done")}</Button></ActionBar>
    </>;
  }
  const open = await openForMe(viewer.id, new Date()).catch(() => null);
  const contact = await panitiaContact(settings, open?.session).catch(() => null);
  return <Scanner current={open ? { title: open.session.title, place: open.session.place, until: open.until } : null} contact={contact} />;
}
