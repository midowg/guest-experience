import { notFound } from "next/navigation";
import { getAdminEvent } from "@/lib/server/events";
import { isSupabaseConfigured } from "@/lib/server/config";
import { EventExperience } from "@/components/guest/EventExperience";
import { AdminShell, EventNavigation, SetupNotice } from "@/components/admin/AdminShell";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { id } = await params;
  const event = await getAdminEvent(id);
  if (!event) notFound();
  return <><AdminShell><h1>Preview undangan</h1><EventNavigation event={event} current="preview" /><Notice>Preview admin — versi terakhir tersimpan, bukan perubahan editor yang belum disimpan. Pengiriman RSVP dan feedback dinonaktifkan.</Notice></AdminShell><EventExperience event={event} preview /></>;
}
