import { GroupRoomScreen } from "@/components/main-wam/peserta/saya/GroupRoomScreen";
import { roomSub, stayTime } from "@/lib/main-wam/peserta/saya";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
import { loadGroupRoom } from "@/lib/server/main-wam/peserta/saya";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kelompok & kamar · WAM", robots: { index: false } };

/** L01 Kelompok & kamar. Owner A (peserta); the gate first. Only the person's own room, kelompok and kelompok kegiatan. */
export default async function GroupRoomPage() {
  const context = await requireMainWamPage(mainWamPath.groupRoom);
  const { viewer, settings } = context;
  const data = await loadGroupRoom(context);
  return <GroupRoomScreen
    room={viewer.room ? { name: viewer.room.name, sub: roomSub(viewer.room), note: viewer.room.note, people: viewer.room.people } : null}
    stay={{ checkIn: stayTime(settings.event.checkInAt), checkOut: stayTime(settings.event.checkOutAt) }}
    {...data} />;
}
