import type { Metadata } from "next";
import { LiveCms } from "@/components/leadership-reset/Live";
import { LR_MIGRATION } from "@/lib/leadership-reset/form";
import { ServiceError } from "@/lib/server/config";
import { cmsView } from "@/lib/server/leadership-reset";
import { LrNotice } from "../Waiting";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "CMS · Refleksi Leader" }, robots: { index: false, follow: false } };

/** /refleksi/kelola: the CMS, opened straight by its address (no key, no sign-in; 19 Nov 2026). */
export default async function LeadershipResetCmsPage() {
  const view = await cmsView(null).catch(error => { if (error instanceof ServiceError && error.status === 503) return null; throw error; });
  if (!view) return <LrNotice title="Menunggu migrasi">Database Refleksi Leader belum dipasang (<code>{LR_MIGRATION}</code>).</LrNotice>;
  return <LiveCms cmsKey="" initial={view} />;
}
