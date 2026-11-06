import { notFound } from "next/navigation";
import { SuperAdminFrame } from "@/components/admin/super/SuperAdminFrame";
import { PageHeader } from "@/components/console";
import { TemplatesAndEvents, type SuperEventRow } from "@/components/admin/super/TemplatesAndEvents";
import { createSeedEvent } from "@/lib/seed-event";

export const dynamic = "force-dynamic";

/** Layout check for Templat & acara with made-up events. Changes are refused without a session. */
export default function DevTemplatesPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const base = createSeedEvent();
  const row = (n: number, title: string, patch: Partial<SuperEventRow> = {}): SuperEventRow => ({ ...base, id: `9c1d0000-0000-4000-8000-00000000000${n}`, slug: `contoh-${n}`, title, ...patch });
  const events = [
    row(1, "Contoh Gala Dinner 2026", { status: "published", event_kind: "acara", starts_at: "2026-12-12T12:00:00.000Z" }),
    row(2, "Contoh Nyadran Tim", { audience: "internal", event_kind: "acara" }),
    row(3, "Contoh Kunjungan PT Sinar Abadi", { event_kind: "kunjungan", status: "published", starts_at: "2026-11-12T03:00:00.000Z" }),
    row(4, "Contoh Bootcamp Sales", { event_kind: "program", audience: "internal", status: "archived" }),
    row(5, "Contoh Friday Sharing Panti", { event_kind: "csr", status: "published" }),
  ];
  return <SuperAdminFrame current="templat" wide>
    <PageHeader title="Templat & acara (contoh)" subtitle="Per jenis acara: templat yang bisa dipilih admin biasa di Buat acara, dan acara yang bisa mereka lihat." />
    <TemplatesAndEvents events={events} initialEnabled={["kunjungan-klien", "trip-klien", "gala-dinner"]} templatesMigrated initialHidden={[events[1].id]} visibilityMigrated />
  </SuperAdminFrame>;
}
