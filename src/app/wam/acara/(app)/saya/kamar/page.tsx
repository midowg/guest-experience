import { RoomScreen } from "@/components/main-wam/peserta/saya/RoomScreen";
import { roomSub, stayTime } from "@/lib/main-wam/peserta/saya";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
import { readLang } from "@/lib/server/main-wam/lang";
import { loadRoom } from "@/lib/server/main-wam/peserta/saya";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kamar · WAM", robots: { index: false } };

/** L01 Kamar. Owner A (peserta); the gate first. Only the person's own room. */
export default async function RoomPage() {
  const context = await requireMainWamPage(mainWamPath.room);
  const { viewer, settings } = context;
  const data = await loadRoom(context);
  const lang = await readLang();
  return <RoomScreen
    room={viewer.room ? { name: viewer.room.name, sub: roomSub(viewer.room, lang), note: viewer.room.note, people: viewer.room.people } : null}
    stay={{ checkIn: stayTime(settings.event.checkInAt, lang), checkOut: stayTime(settings.event.checkOutAt, lang) }}
    {...data} />;
}
