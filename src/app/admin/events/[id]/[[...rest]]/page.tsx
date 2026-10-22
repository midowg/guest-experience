import { permanentRedirect } from "next/navigation";
import { adminEventPath, type AdminTab } from "@/lib/routes";

/** Older admin addresses (/admin/events/{id}/…) move to /admin/acara/{ref}/…; the id still works there. */
const tabs: Record<string, AdminTab> = { "": "edit", invitations: "invitations", responses: "responses", checkin: "checkin", beo: "beo", "beo/cetak": "beo-print", galeri: "gallery", feedback: "feedback", preview: "preview" };

export default async function LegacyAdminEvent({ params, searchParams }: { params: Promise<{ id: string; rest?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id, rest = [] } = await params;
  const query = Object.fromEntries(Object.entries(await searchParams).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []));
  permanentRedirect(adminEventPath(id, tabs[rest.join("/")] ?? "edit", query));
}
