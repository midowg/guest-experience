import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/shared/AdminShell";
import { EventList } from "@/components/admin/events/EventList";
import { createSeedEvent } from "@/lib/seed-event";
import type { EventRecord } from "@/lib/types";
import type { StandaloneApp } from "@/lib/server/standalone-apps";
import { smTdnYogyakarta } from "@/lib/fixtures/sm-tdn-yogyakarta";

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
    event(5, { title: "Contoh Gala Dinner 2025", status: "archived", event_kind: "acara", starts_at: "2025-12-12T19:00:00+07:00" }),
    // Placeholder photography for the card preview, layout checking only.
    { ...smTdnYogyakarta(), id: "9c1d0000-0000-4000-8000-000000000006", status: "published" as const, hero: { ...base.hero, url: "https://picsum.photos/seed/sm-tdn/1600/1000", alt: "Contoh foto sampul", srcset: [] } },
    event(7, { title: "Your Visit to Werkudara", status: "published", event_kind: "panduan" }),
  ];
  // The standalone apps as the admin page gets them (standaloneApps), fixed for the layout check.
  const apps: StandaloneApp[] = [
    { key: "wam", name: "WAM 2027", eyebrow: "Aplikasi karyawan", status: "Minggu Pra WAM · 28 Okt–29 Des · WAM 55 hari lagi", address: "/wam", description: "Login per karyawan: agenda, appraisal, booking ruang, absen QR, dokumen, dan pengumuman. Panitia mengelola sesi dari dalam aplikasi.", open: { label: "Buka aplikasi", href: "/wam" }, manage: { label: "Kelola WAM", href: "/admin/wam" }, waiting: { label: "2 permintaan reset password", href: "/admin/wam/permintaan-reset" } },
    { key: "booking", name: "Booking Kantor", eyebrow: "Booking ruangan", status: "Ruang kantor, di luar WAM", address: "/booking", description: "Booking ruangan kantor untuk semua karyawan dengan akun WAM, berbagi ruang dan jadwal yang sama dengan WAM. Staf administrasi mengelola semua booking.", open: { label: "Buka aplikasi", href: "/booking" }, manage: { label: "Kelola booking", href: "/booking/kelola" } },
    { key: "tv", name: "TV Announcement", eyebrow: "Digital signage", status: "TV kantor", address: "/tv", description: "Kendali signage TV kantor: alamat tiap TV, jadwal ruang hari ini dan minggu ini, gambar pengumuman dan durasinya, mode, serta QR. Semua bisa diatur sendiri.", open: { label: "Buka tayangan", href: "/tv" }, manage: { label: "Atur TV", href: "/admin/wam/tv" } },
  ];
  return <AdminShell bare><EventList events={events} featuredId={events[0].id} phases={{ [events[1].id]: "day", [events[3].id]: "after" }} templates={["kunjungan-klien", "trip-klien"]} apps={apps} /></AdminShell>;
}
