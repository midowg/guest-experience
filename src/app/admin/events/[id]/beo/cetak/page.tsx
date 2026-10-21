import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BeoPrint } from "@/components/admin/beo/BeoPrint";
import { SetupNotice } from "@/components/admin/shared/AdminShell";
import { beoDocument, beoVersionFromParam } from "@/lib/beo-document";
import { loadBeo } from "@/lib/server/beo";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage, requireEventPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cetak BEO", robots: { index: false, follow: false } };

/** A4 print page for the BEO, ?versi=penyedia (default) or internal. No admin header, so it prints clean. */
export default async function BeoPrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ versi?: string }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const { id } = await params;
  await requireEventPage(id);
  const data = await loadBeo(id);
  if (!data) notFound();
  const version = beoVersionFromParam((await searchParams).versi);
  return <BeoPrint eventId={id} doc={beoDocument(data.event, data.summary, data.state, data.revisions, version)} />;
}
