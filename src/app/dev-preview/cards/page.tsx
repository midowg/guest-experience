import { notFound } from "next/navigation";
import { EventList } from "@/components/admin/EventList";
import { createSeedEvent } from "@/lib/seed-event";

export const dynamic = "force-dynamic";

/** Development-only layout check for the event cards; never reachable in production. */
export default function DevCardsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const base = createSeedEvent();
  const events = [
    { ...base, status: "published" as const, created_at: "2026-10-09T03:12:00Z", updated_at: "2026-10-09T12:48:00Z" },
    {
      ...base,
      id: "10f3a511-2331-4000-8000-000000000002",
      slug: "rapat-panitia-nyepi-1949-2b1cbf30-ff95-4b9d-badc-b051be2e7a6f",
      title: "Rapat Panitia Inti dan Koordinator Hari Suci Nyepi Tahun Saka 1949 Daerah Istimewa Yogyakarta",
      status: "draft" as const,
      created_at: "2026-10-08T22:05:00Z",
      updated_at: "2026-10-09T01:30:00Z",
    },
  ];
  return <main className="container" style={{ paddingBlock: "3rem" }}><EventList events={events} /></main>;
}
