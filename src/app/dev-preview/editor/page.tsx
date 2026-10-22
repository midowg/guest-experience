import { notFound } from "next/navigation";
import { AdminShell, EventNavigation } from "@/components/admin/shared/AdminShell";
import { EventEditor } from "@/components/admin/editor/EventEditor";
import { DeleteEvent } from "@/components/admin/events/DeleteEvent";
import { createSeedEvent } from "@/lib/seed-event";
import { presetPoster } from "@/lib/poster-presets";

export const dynamic = "force-dynamic";

/**
 * Layout check for the editor with its phone preview. Saving is refused without a session.
 * ?super=1 shows the super admin's controls (theme, poster design library).
 */
export default async function DevEditorPage({ searchParams }: { searchParams: Promise<{ super?: string }> }) {
  const superAdmin = (await searchParams).super === "1";
  if (process.env.NODE_ENV === "production") notFound();
  const event = { ...createSeedEvent(), code: "AB23CD" };
  const person = (n: number, name: string, role: string, photo = "") => ({ id: `5f000000-0000-4000-8000-00000000000${n}`, name, role, phone: `0812 0000 000${n}`, photo: { url: photo, alt: name, srcset: [] }, active: true, sort_order: n });
  const staff = [person(1, "Contoh Raka Pratama", "Hospitality", "https://picsum.photos/seed/wk-staf1/200/200"), person(2, "Contoh Sari Dewi", "Sales")];
  return <AdminShell wide><h1>Editor (contoh)</h1><EventNavigation event={{ ...event, status: "published" }} current="edit" /><EventEditor event={event} origin="https://invitation.werkudara.group" staff={staff} superAdmin={superAdmin} posterDesigns={[{ id: "4b0f0000-0000-4000-8000-000000000001", name: "Contoh desain tersimpan", description: "Dari acara sebelumnya", template: { ...presetPoster("rempah-nusantara", event), fields: presetPoster("rempah-nusantara", event).fields }, created_at: "2026-10-22T00:00:00Z" }]} previewSrc="/dev-preview/pratinjau-langsung" dangerZone={<DeleteEvent event={event} isFeatured={false} bare />} /></AdminShell>;
}
