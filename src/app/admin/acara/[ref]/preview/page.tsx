import { notFound } from "next/navigation";
import { getAdminEvent, resolveEventRef } from "@/lib/server/events";
import { isSupabaseConfigured } from "@/lib/server/config";
import { EventExperience } from "@/components/guest/EventExperience";
import { AdminShell, EventNavigation, SetupNotice } from "@/components/admin/shared/AdminShell";
import { Notice } from "@/components/ui";
import { currentPhase, isPhase, phaseLabels } from "@/lib/event-phase";
import type { EventPhase } from "@/lib/types";
import { requireAdminPage, requireEventPage } from "@/lib/server/admin-session";
import { rsvpNeedsReady } from "@/lib/server/responses";

export const dynamic = "force-dynamic";
export default async function PreviewPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const id = await resolveEventRef((await params).ref);
  if (!id) notFound();
  await requireEventPage(id);
  const event = await getAdminEvent(id);
  if (!event) notFound();
  const requested = (await searchParams).fase;
  const auto = currentPhase(event);
  const phase: EventPhase = isPhase(requested) ? requested : auto;
  return <><AdminShell><h1>Preview undangan</h1><EventNavigation event={event} current="preview" /><Notice>Preview admin — versi terakhir tersimpan, bukan perubahan editor yang belum disimpan. Pengiriman RSVP dan feedback dinonaktifkan.</Notice>
    <nav aria-label="Lihat fase acara" className="row">{(["before", "day", "after"] as const).map(key => <a key={key} className={`button ${key === phase ? "button--primary" : "button--secondary"}`} href={`?fase=${key}`} aria-current={key === phase ? "page" : undefined}>{phaseLabels[key]}{key === auto ? " (sekarang)" : ""}</a>)}</nav>
  </AdminShell><EventExperience event={event} preview phase={phase} rsvpNeeds={await rsvpNeedsReady()} /></>;
}
