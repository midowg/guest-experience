import type { Metadata } from "next";
import { LiveCms } from "@/components/leadership-reset/Live";
import { LR_MIGRATION } from "@/lib/leadership-reset/form";
import { leadershipResetPath } from "@/lib/routes";
import { cmsView, opensCms } from "@/lib/server/leadership-reset";
import { LrNotice } from "../../Waiting";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "CMS · Refleksi Leader", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Refleksi Leader's CMS, opened by its secret link (no sign-in). */
export default async function LeadershipResetCmsPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const opens = await opensCms(key);
  if (opens === null) return <LrNotice title="Menunggu migrasi">Database Refleksi Leader belum dipasang. Pemilik menjalankan <code>{LR_MIGRATION}</code> di Supabase SQL Editor.</LrNotice>;
  if (!opens) return <LrNotice title="Tautan tidak dikenal">Tautan CMS ini salah atau sudah diganti. <a href={leadershipResetPath.cmsOther}>Masukkan tautan CMS terbaru</a>.</LrNotice>;
  return <LiveCms cmsKey={key} initial={await cmsView(key)} />;
}
