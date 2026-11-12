import { notFound } from "next/navigation";
import { MinutesDue } from "@/components/pra-wam/MinutesDue";
import { MinutesPanel } from "@/components/pra-wam/MinutesPanel";
import type { MinutesView } from "@/lib/pra-wam/minutes";
import type { Session } from "@/lib/pra-wam/sessions";
import { PRA_WAM_PATH } from "@/lib/routes";
import base from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";

const RAJA = "11111111-1111-4111-8111-111111111111", DEWI = "22222222-2222-4222-8222-222222222222", BIMA = "33333333-3333-4333-8333-333333333333";
const attendees: MinutesView["attendees"] = [
  { id: RAJA, name: "Raja", fullName: "Raja Pratama", department: "Sales & Marketing", position: "Head of Department", frmPosition: "Head of Department", checkedIn: true, checkInMethod: "offline" },
  { id: DEWI, name: "Dewi", fullName: "Dewi Lestari", department: "Sales & Marketing", position: "Coordinator", frmPosition: "Coordinator", checkedIn: true, checkInMethod: "offline" },
  { id: BIMA, name: "Bima", fullName: "Bima Putra", department: "Finance", position: "Staff", frmPosition: "Staff", checkedIn: false, checkInMethod: null },
  { id: "me", name: "Saya", fullName: "Saya Sendiri", department: "Comms", position: "Staff", frmPosition: "Staff", checkedIn: true, checkInMethod: "offline" },
];
const people = attendees.map(({ id, name }) => ({ id, name }));
const photo = (id: string, file: string) => ({ id, url: `${PRA_WAM_PATH}/${file}`, width: 1280, height: 720, uploadedBy: "Raja", canDelete: true });
const written: MinutesView = {
  migrated: true, needed: true, status: "sudah", canWrite: true, open: true, viewerId: "me", people, endsAt: "2026-11-10T03:30:00.000Z", drafts: true,
  title: "Appraisal team SS", startsAt: "2026-11-10T02:00:00.000Z", place: "CFC Ananta Room",
  frm: true, attendees, defaultChairId: RAJA, photos: [photo("p1", "tv-welcome-werkudara.webp"), photo("p2", "tv-bday-flowers.webp"), photo("p3", "icon-512.png")], photosReady: true, photoHd: true, staff: [{ id: "andi", name: "Andi", fullName: "Andi Wijaya", department: "Finance" }, { id: "sari", name: "Sari", fullName: "Sari Melati", department: "Human Resources" }],
  telegram: { ready: true, reason: null, destinations: ["WG SM · Commercial"], deliveries: [{ title: "WG SM · Commercial", status: "terkirim", error: null, version: 2, at: "2026-11-10T06:30:00.000Z" }] },
  minutes: {
    summary: "", decisions: "", number: "MoM/2026/11/0012", docNumber: null,
    items: [
      { topic: "Target penjualan Q1", discussion: "Realisasi Q4 98% dari target. Pasar korporat tumbuh.", decision: "Target Q1 naik 10%.", added: false },
      { topic: "Event klien di Bali", discussion: "Dua pilihan venue dibandingkan dari sisi kapasitas dan biaya.", decision: "Event Bali dipegang tim SM.\nSurvei venue minggu depan.", added: false },
      { topic: "Seragam tim lapangan", discussion: "Usulan seragam baru untuk event 2027.", decision: "", added: true },
    ],
    chairId: RAJA, chairName: "Raja", absentIds: [BIMA], guests: "Pak Andi (klien)",
    next: { date: "2026-11-24", time: "10:00", place: "Ruang Vasuki", agenda: "Hasil survei venue Bali" },
    submittedBy: "Dewi", submittedAt: "2026-11-10T04:00:00.000Z", updatedBy: "Dewi", updatedAt: "2026-11-10T06:30:00.000Z",
    sentAt: "2026-11-10T04:10:00.000Z", sentBy: "Dewi", version: 2, telegramOff: false,
    actions: [
      { id: "a1", task: "Kirim data penjualan Oktober ke Finance", picId: "me", picName: "Saya", dueDate: "2026-11-14", done: false },
      { id: "a2", task: "Survei venue Bali", picId: DEWI, picName: "Dewi", dueDate: "2026-11-20", done: true },
    ],
  },
};
const due = (id: string, title: string, day: string): Session => ({
  id, title, kind: "rapat", description: "", status: "terbit", planFrom: null, planTo: null, startsAt: `${day}T02:00:00.000Z`, endsAt: `${day}T03:30:00.000Z`,
  roomId: null, roomName: "Vasuki", location: "", participantCount: 4, isParticipant: true, participants: null,
});

/**
 * Layout check for Notulen (MoM) without signing in: ?tema=terang for light, ?isi=kosong for one
 * not written yet (press Tulis notulen for the form), ?isi=lama for one from before the FRM form.
 */
export default async function DevMinutesPage({ searchParams }: { searchParams: Promise<{ tema?: string; isi?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { tema, isi } = await searchParams;
  const view: MinutesView = isi === "kosong" ? { ...written, status: "belum", minutes: null, photos: [] }
    : isi === "lama" ? { ...written, frm: false, photos: [], photosReady: false, minutes: { ...written.minutes!, number: null, items: [], chairId: null, chairName: null, absentIds: [], guests: "", next: null, summary: "Membahas target penjualan Q1 dan rencana event klien di Bali.", decisions: "Target Q1 naik 10%.\nEvent Bali dipegang tim SM." } }
      : written;
  return <div data-wam-look="dream" data-wam-theme={tema === "terang" ? "light" : "dark"}>
    <div className={base.app} style={{ minHeight: "100vh", padding: 20, display: "grid", gap: 20, maxWidth: 760 }}>
      <MinutesDue sessions={[due("s1", "Appraisal team SM", "2026-11-10"), due("s2", "ITEM: HRGA x CoE", "2026-11-09")]} drafts={["s2"]} />
      <MinutesPanel sessionId="5e550000-0000-4000-8000-000000000001" initial={view} />
    </div>
  </div>;
}
