import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { SuperDashboard, type SuperEventRow } from "@/components/admin/SuperDashboard";
import { createSeedEvent } from "@/lib/seed-event";

export const dynamic = "force-dynamic";

/** Layout check for the super admin dashboard with sample events. Changes are refused without a session. */
export default function DevSuperPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const base = createSeedEvent();
  const row = (n: number, title: string, patch: Partial<SuperEventRow> = {}): SuperEventRow => ({ ...base, id: `9c1d0000-0000-4000-8000-00000000000${n}`, slug: `contoh-${n}`, title, ...patch });
  const events = [
    row(1, "Contoh Gala Dinner", { status: "published", event_kind: "acara" }),
    row(2, "Contoh Nyadran", { audience: "internal" }),
    row(3, "Contoh Kunjungan Mitra", { event_kind: "kunjungan", status: "published" }),
    row(4, "Contoh Bootcamp", { event_kind: "program", audience: "internal", status: "archived" }),
  ];
  return <AdminShell bare><h1>Dashboard super admin (contoh)</h1><SuperDashboard events={events} initialHidden={[events[1].id]} migrated /></AdminShell>;
}
