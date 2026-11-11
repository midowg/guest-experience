import { notFound } from "next/navigation";
import { MinutesDue } from "@/components/pra-wam/MinutesDue";
import { MinutesPanel } from "@/components/pra-wam/MinutesPanel";
import type { MinutesView } from "@/lib/pra-wam/minutes";
import type { Session } from "@/lib/pra-wam/sessions";
import base from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";

const people = [{ id: "11111111-1111-4111-8111-111111111111", name: "Raja" }, { id: "22222222-2222-4222-8222-222222222222", name: "Dewi" }, { id: "me", name: "Saya" }];
const written: MinutesView = {
  migrated: true, needed: true, status: "sudah", canWrite: true, open: true, viewerId: "me", people,
  minutes: {
    summary: "Membahas target penjualan Q1 dan rencana event klien di Bali.", decisions: "Target Q1 naik 10%.\nEvent Bali dipegang tim SM.",
    submittedBy: "Raja", submittedAt: "2026-11-10T04:00:00.000Z", updatedBy: "Dewi", updatedAt: "2026-11-10T06:30:00.000Z",
    actions: [
      { id: "a1", task: "Kirim data penjualan Oktober ke Finance", picId: "me", picName: "Saya", dueDate: "2026-11-14", done: false },
      { id: "a2", task: "Survei venue Bali", picId: "22222222-2222-4222-8222-222222222222", picName: "Dewi", dueDate: "2026-11-20", done: true },
    ],
  },
};
const due = (id: string, title: string, day: string): Session => ({
  id, title, kind: "rapat", description: "", status: "terbit", planFrom: null, planTo: null, startsAt: `${day}T02:00:00.000Z`, endsAt: `${day}T03:30:00.000Z`,
  roomId: null, roomName: "Vasuki", location: "", participantCount: 4, isParticipant: true, participants: null,
});

/** Layout check for Notulen (MoM) without signing in: ?tema=terang for light, ?isi=kosong for an empty one being written. */
export default async function DevMinutesPage({ searchParams }: { searchParams: Promise<{ tema?: string; isi?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { tema, isi } = await searchParams;
  const view: MinutesView = isi === "kosong" ? { ...written, status: "belum", minutes: null } : written;
  return <div data-wam-look="dream" data-wam-theme={tema === "terang" ? "light" : "dark"}>
    <div className={base.app} style={{ minHeight: "100vh", padding: 20, display: "grid", gap: 20, maxWidth: 760 }}>
      <MinutesDue sessions={[due("s1", "Appraisal team SM", "2026-11-10"), due("s2", "ITEM: HRGA x CoE", "2026-11-09")]} />
      <MinutesPanel sessionId="5e550000-0000-4000-8000-000000000001" initial={view} />
    </div>
  </div>;
}
