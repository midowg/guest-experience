import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/server/admin-session";
import { isSupabaseConfigured } from "@/lib/server/config";
import { currentPlaceGuideId } from "@/lib/server/events";
import EventEditorPage from "../acara/[ref]/page";

export const dynamic = "force-dynamic";

/** /admin/your-visit: the Panduan lokasi editor, without an event code in the address. None yet is a 404. */
export default async function YourVisitEditorPage() {
  await requireAdminPage();
  const id = isSupabaseConfigured() ? await currentPlaceGuideId() : null;
  if (!id) notFound();
  return EventEditorPage({ params: Promise.resolve({ ref: id }) });
}
