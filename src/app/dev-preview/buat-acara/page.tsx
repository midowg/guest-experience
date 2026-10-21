import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/shared/AdminShell";
import { DevCreateEvent } from "./DevCreateEvent";
import { createSeedEvent } from "@/lib/seed-event";

export const dynamic = "force-dynamic";

/** Layout check for the "Buat acara" survey without signing in. Creating is refused without a session. */
export default function DevCreateEventPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminShell bare><DevCreateEvent events={[createSeedEvent()]} /></AdminShell>;
}
