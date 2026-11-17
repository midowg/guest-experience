import { notFound } from "next/navigation";
import { GuideScreen } from "@/components/main-wam/peserta/panduan/GuideScreen";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
import { loadGuide } from "@/lib/server/main-wam/peserta/saya";

export const dynamic = "force-dynamic";
export const metadata = { title: "Panduan · WAM", robots: { index: false } };

/** One guide (L04). Owner A (peserta); the gate first; an unpublished or unknown guide is not found. */
export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { settings } = await requireMainWamPage(mainWamPath.guide(slug));
  const guide = await loadGuide(slug);
  if (!guide) notFound();
  const hotel = guide.kind === "hotel" ? { name: settings.event.hotel.trim(), address: settings.event.address.trim() } : null;
  return <GuideScreen guide={guide} hotel={hotel} />;
}
