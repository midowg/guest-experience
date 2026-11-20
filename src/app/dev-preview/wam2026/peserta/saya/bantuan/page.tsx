import { notFound } from "next/navigation";
// The frame (theme) first, so its reset comes before the screen's styles, as the app's layout does.
import { Frame } from "../../Frame";
import { HelpScreen } from "@/components/main-wam/peserta/saya/HelpScreen";
import { ListSkeleton } from "@/components/main-wam/peserta/Skeletons";
import { contactLinks } from "@/lib/main-wam/peserta/contact";
import { samplePeople } from "@/lib/main-wam/sample";
import { mainWamPath } from "@/lib/routes";
import { previewTime } from "../../sample";

export const dynamic = "force-dynamic";

/** Bantuan (dev-preview): ?status=memuat|tanpa-kontak. */
export default async function PreviewHelp({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const now = previewTime({ waktu: "pemaparan" });
  if (params.status === "memuat") return <Frame path={mainWamPath.help} now={now}><ListSkeleton label="Memuat bantuan" groups={[3, 1]} /></Frame>;
  const help = params.status === "tanpa-kontak" ? null : { id: samplePeople.dimas.id, name: "Dimas", role: "Panitia", photo: null, ...contactLinks("0800-0000-0001") };
  return <Frame path={mainWamPath.help} now={now}><HelpScreen help={help} /></Frame>;
}
