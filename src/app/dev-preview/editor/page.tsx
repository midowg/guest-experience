import { notFound } from "next/navigation";
import { AdminShell, EventNavigation } from "@/components/admin/shared/AdminShell";
import { EventEditor } from "@/components/admin/editor/EventEditor";
import { DeleteEvent } from "@/components/admin/events/DeleteEvent";
import { createSeedEvent } from "@/lib/seed-event";
import { presetPoster } from "@/lib/poster-presets";
import { templateOf } from "@/lib/event-templates";
import { templateGuide } from "@/lib/event-setup";

export const dynamic = "force-dynamic";

/**
 * Layout check for the editor with its phone preview. Saving is refused without a session.
 * ?super=1 shows the super admin's controls (theme, poster design library); ?kartu=1 a card event;
 * ?eguide=1 an E-Guide started from the "e-guide" template.
 */
export default async function DevEditorPage({ searchParams }: { searchParams: Promise<{ super?: string; kartu?: string; eguide?: string }> }) {
  const query = await searchParams;
  const superAdmin = query.super === "1";
  if (process.env.NODE_ENV === "production") notFound();
  const seed = { ...createSeedEvent(), code: "AB23CD" };
  // ?kartu=1: a card event, edited with the card block only.
  const eguide = templateOf("e-guide")!;
  let uuid = 0;
  const event = query.kartu === "1" ? { ...seed, title: "Poster sesi JCWF 2026", event_kind: "kartu" as const, poster: presetPoster("rempah-nusantara", seed) }
    : query.eguide === "1" ? { ...seed, title: "Mengenal Lombok", event_kind: "eguide" as const, theme: { key: eguide.theme, corners: "square" as const }, rsvp_enabled: false, feedback_enabled: false,
      sections: seed.sections.map(section => ({ ...section, enabled: (eguide.modules as string[]).includes(section.key) })),
      guide: templateGuide(eguide.guide!, "Mengenal Lombok", () => `6e000000-0000-4000-8000-00000000000${++uuid}`) }
    : seed;
  const person = (n: number, name: string, role: string, photo = "") => ({ id: `5f000000-0000-4000-8000-00000000000${n}`, name, role, phone: `0812 0000 000${n}`, photo: { url: photo, alt: name, srcset: [] }, active: true, sort_order: n });
  const staff = [person(1, "Contoh Raka Pratama", "Hospitality", "https://picsum.photos/seed/wk-staf1/200/200"), person(2, "Contoh Sari Dewi", "Sales")];
  return <AdminShell wide><h1>Editor (contoh)</h1><EventNavigation event={{ ...event, status: "published" }} current="edit" /><EventEditor event={event} origin="https://invitation.werkudara.group" staff={staff} superAdmin={superAdmin} posterDesigns={[{ id: "4b0f0000-0000-4000-8000-000000000001", name: "Contoh desain tersimpan", description: "Dari acara sebelumnya", template: { ...presetPoster("rempah-nusantara", event), fields: presetPoster("rempah-nusantara", event).fields }, created_at: "2026-10-22T00:00:00Z" }]} previewSrc="/dev-preview/pratinjau-langsung" dangerZone={<DeleteEvent event={event} isFeatured={false} bare />} /></AdminShell>;
}
