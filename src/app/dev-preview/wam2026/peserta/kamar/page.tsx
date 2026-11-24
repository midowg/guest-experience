import { notFound } from "next/navigation";
import { previewLang } from "@/components/main-wam/dev/lang";
// The frame (theme) first, so its reset comes before the screen's styles, as the app's layout does.
import { Frame } from "../Frame";
import { RoomScreen } from "@/components/main-wam/peserta/saya/RoomScreen";
import { RoomSkeleton } from "@/components/main-wam/peserta/Skeletons";
import { t } from "@/lib/main-wam/i18n";
import { contactLinks } from "@/lib/main-wam/peserta/contact";
import { roomSub, stayTime } from "@/lib/main-wam/peserta/saya";
import { samplePeople, sampleRoom3, sampleRoom5, sampleSettings } from "@/lib/main-wam/sample";
import { mainWamPath } from "@/lib/routes";
import { previewTime } from "../sample";

export const dynamic = "force-dynamic";

/** L01 Kamar with sample data (dev-preview): ?kamar=3|5, ?status=memuat|kamar-belum. */
export default async function PreviewRoom({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const lang = previewLang(params);
  const now = previewTime({ waktu: "pemaparan" });
  if (params.status === "memuat") return <Frame path={mainWamPath.room} now={now} lang={lang}><RoomSkeleton /></Frame>;
  const settings = sampleSettings();
  const room = params.kamar === "5" ? sampleRoom5 : sampleRoom3;
  const roomHelp = { id: samplePeople.putri.id, name: "Putri", role: t(lang, "peserta.contact.roomCommittee"), photo: null, ...contactLinks("0800-0000-0002") };
  return <Frame path={mainWamPath.room} now={now} lang={lang}>
    <RoomScreen room={params.status === "kamar-belum" ? null : { name: room.name, sub: roomSub(room, lang), note: room.note, people: room.people }}
      stay={{ checkIn: stayTime(settings.event.checkInAt, lang), checkOut: stayTime(settings.event.checkOutAt, lang) }} roomHelp={roomHelp} sample />
  </Frame>;
}
