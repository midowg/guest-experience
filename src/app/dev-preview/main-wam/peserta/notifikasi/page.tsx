import { notFound } from "next/navigation";
import { previewLang } from "@/components/main-wam/dev/lang";
// The frame (theme) first, so its reset comes before the screen's styles, as the app's layout does.
import { Frame } from "../Frame";
import { NotificationsScreen } from "@/components/main-wam/peserta/notifikasi/NotificationsScreen";
import { ListSkeleton } from "@/components/main-wam/peserta/Skeletons";
import { groupNotifications } from "@/lib/main-wam/peserta/notifications";
import { mainWamPath } from "@/lib/routes";
import type { PushState } from "@/components/main-wam/peserta/usePushDevice";
import { previewNotifications, previewTime } from "../sample";

export const dynamic = "force-dynamic";

/** N01 Notifikasi with sample data (dev-preview): ?status=memuat|kosong|hp-mati, ?buka=<id> (an announcement's sheet), ?jam= on Sel. */
export default async function PreviewNotifications({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const lang = previewLang(params);
  const now = previewTime({ hari: "2", jam: params.jam ?? "10:35" });
  if (params.status === "memuat") return <Frame path={mainWamPath.notifications} now={now} lang={lang}><ListSkeleton label="Memuat notifikasi" groups={[4, 2]} /></Frame>;
  const items = params.status === "kosong" ? [] : previewNotifications(now);
  const grouped = groupNotifications(items, now, lang);
  const push: PushState = params.status === "hp-mati" ? "off" : "on";
  return <Frame path={mainWamPath.notifications} now={now} lang={lang}>
    <NotificationsScreen migrated {...grouped} unread={items.filter(item => !item.readAt).length} preview={{ push, open: params.buka }} />
  </Frame>;
}
