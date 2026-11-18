import { notFound } from "next/navigation";
import { previewLang } from "@/components/main-wam/dev/lang";
// The frame (theme) first, so its reset comes before the screen's styles, as the app's layout does.
import { Frame } from "../Frame";
import { GroupRoomScreen } from "@/components/main-wam/peserta/saya/GroupRoomScreen";
import { GroupRoomSkeleton } from "@/components/main-wam/peserta/Skeletons";
import { t } from "@/lib/main-wam/i18n";
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
  const lang = previewLang(params);
  const now = previewTime({ waktu: "pemaparan" });
  if (params.status === "memuat") return <Frame path={mainWamPath.groupRoom} now={now} lang={lang}><GroupRoomSkeleton /></Frame>;
  const viewer = previewViewer("peserta");
  const settings = sampleSettings();
  const room = params.kamar === "5" ? sampleRoom5 : sampleRoom3;
  const people = new Map(samplePeopleList().map(person => [person.id, person]));
  const group = params.status === "kelompok-belum" ? null : { title: t(lang, "peserta.group.title", { number: 4, name: "Arjuno" }), size: sampleGroup4.members.length, members: memberRows(sampleGroup4, people, viewer.id, lang) };
  const roomHelp = { id: samplePeople.putri.id, name: "Putri", role: t(lang, "peserta.contact.roomCommittee"), photo: null, ...contactLinks("0800-0000-0002") };
  return <Frame path={mainWamPath.groupRoom} now={now} lang={lang}>
    <GroupRoomScreen room={params.status === "kamar-belum" ? null : { name: room.name, sub: roomSub(room, lang), note: room.note, people: room.people }}
      stay={{ checkIn: stayTime(settings.event.checkInAt, lang), checkOut: stayTime(settings.event.checkOutAt, lang) }}
      group={group} groupsPublished={params.status !== "kelompok-belum"}
      activities={activityRows(sampleActivityGroups.filter(item => item.members.includes(viewer.id)), sampleSessions, lang)} roomHelp={roomHelp} />
  </Frame>;
}
