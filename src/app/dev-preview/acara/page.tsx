import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { EventList } from "@/components/admin/EventList";
import { createSeedEvent } from "@/lib/seed-event";
import type { EventRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Layout check for the event list with sample events. Actions are refused without a session. */
export default function DevEventListPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const base = createSeedEvent();
  const event = (n: number, patch: Partial<EventRecord>): EventRecord => ({ ...base, id: `9c1d0000-0000-4000-8000-00000000000${n}`, slug: `contoh-${n}`, ...patch });
  const events = [
    event(1, { title: "Contoh Kunjungan PT Sinar Abadi", status: "published", event_kind: "kunjungan", starts_at: "2026-11-02T09:00:00+07:00" }),
    event(2, { title: "Contoh Trip Lombok bersama Mitra", status: "published", event_kind: "program", starts_at: "2026-10-21T08:00:00+08:00", timezone: "Asia/Makassar" }),
    event(3, { title: "Contoh Kunjungan Tim Kreatif", status: "draft", event_kind: "kunjungan", starts_at: "2026-12-01T10:00:00+07:00" }),
    event(4, { title: "Contoh Kunjungan Bulan Lalu", status: "published", event_kind: "kunjungan", starts_at: "2026-09-15T10:00:00+07:00" }),
  ];
  return <AdminShell bare><EventList events={events} featuredId={events[0].id} phases={{ [events[1].id]: "day", [events[3].id]: "after" }} templates={["kunjungan-klien", "trip-klien"]} /></AdminShell>;
}
