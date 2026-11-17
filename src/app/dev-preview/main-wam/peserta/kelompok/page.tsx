import { notFound } from "next/navigation";
// The frame (theme) first, so its reset comes before the screen's styles, as the app's layout does.
import { Frame } from "../Frame";
import { GroupRoomScreen } from "@/components/main-wam/peserta/saya/GroupRoomScreen";
import { GroupRoomSkeleton } from "@/components/main-wam/peserta/Skeletons";
import { contactLinks } from "@/lib/main-wam/peserta/contact";
import { activityRows, memberRows, roomSub, stayTime } from "@/lib/main-wam/peserta/saya";
import { sampleActivityGroups, sampleGroup4, samplePeople, samplePeopleList, sampleRoom3, sampleRoom5, sampleSessions, sampleSettings } from "@/lib/main-wam/sample";
import { mainWamPath } from "@/lib/routes";
import { previewTime, previewViewer } from "../sample";

export const dynamic = "force-dynamic";

/**
 * L01 Kelompok & kamar with sample data (dev-preview): ?kamar=3|5, ?status=memuat|kamar-belum|
 * kelompok-belum, ?semua=1 (all members shown).
 */
export default async function PreviewGroupRoom({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const now = previewTime({ waktu: "pemaparan" });
  if (params.status === "memuat") return <Frame path={mainWamPath.groupRoom} now={now}><GroupRoomSkeleton /></Frame>;
  const viewer = previewViewer("peserta");
  const settings = sampleSettings();
  const room = params.kamar === "5" ? sampleRoom5 : sampleRoom3;
  const people = new Map(samplePeopleList().map(person => [person.id, person]));
  const group = params.status === "kelompok-belum" ? null : { title: "Kelompok 4 · Arjuno", size: sampleGroup4.members.length, members: memberRows(sampleGroup4, people, viewer.id) };
  const roomHelp = { id: samplePeople.putri.id, name: "Putri", role: "Panitia kamar", photo: null, ...contactLinks("0813-1111-2222") };
  return <Frame path={mainWamPath.groupRoom} now={now}>
    <GroupRoomScreen room={params.status === "kamar-belum" ? null : { name: room.name, sub: roomSub(room), note: room.note, people: room.people }}
      stay={{ checkIn: stayTime(settings.event.checkInAt), checkOut: stayTime(settings.event.checkOutAt) }}
      group={group} groupsPublished={params.status !== "kelompok-belum"}
      activities={activityRows(sampleActivityGroups.filter(item => item.members.includes(viewer.id)), sampleSessions)} roomHelp={roomHelp} />
  </Frame>;
}
