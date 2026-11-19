import type { Metadata } from "next";
import { LiveCoach } from "@/components/leadership-reset/Live";
import { LR_MIGRATION } from "@/lib/leadership-reset/form";
import { coachView, opensCoach } from "@/lib/server/leadership-reset";
import { LrNotice } from "../../Waiting";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Refleksi Leader · untuk Coach", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The coach's reading page, opened by the link the CMS makes (no sign-in). */
export default async function LeadershipResetCoachPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const opens = await opensCoach(key);
  if (opens === null) return <LrNotice title="Menunggu migrasi">Database Refleksi Leader belum dipasang (<code>{LR_MIGRATION}</code>).</LrNotice>;
  if (!opens) return <LrNotice title="Tautan tidak dikenal">Tautan ini salah atau sudah diganti. Minta tautan terbaru ke panitia.</LrNotice>;
  return <LiveCoach coachKey={key} initial={await coachView(key)} />;
}
