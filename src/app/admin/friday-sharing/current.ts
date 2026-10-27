import "server-only";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/server/admin-session";
import { isSupabaseConfigured } from "@/lib/server/config";
import { currentFridaySharingId } from "@/lib/server/events";

/**
 * The event behind /admin/friday-sharing/…, as the { ref } the /admin/acara/[ref] pages expect: the
 * id, so those pages do not send it back here. No Friday Sharing yet is a 404.
 */
export async function fridaySharingParams(): Promise<{ ref: string }> {
  await requireAdminPage();
  const id = isSupabaseConfigured() ? await currentFridaySharingId() : null;
  if (!id) notFound();
  return { ref: id };
}
