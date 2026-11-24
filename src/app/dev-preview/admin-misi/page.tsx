import { notFound } from "next/navigation";
import { ConsoleShell } from "@/components/console";
import { PraWamMission } from "@/components/admin/wam/PraWamMission";
import admin from "@/components/admin/admin.module.css";

export const dynamic = "force-dynamic";

/* Layout check for Admin Pra WAM → Misi Perjalanan with made-up people, without signing in. Simpan calls the real API, which refuses without a session. */
const hod = (name: string, room: string, dept: string) => ({ name, nick: name.split(" ")[0], dept, room, sleep: "22.00–24.00", wake: "05.00–06.30", sents: [6], hints: [`Petunjuk pertama tentang ${name.split(" ")[0]} (contoh).`, "Petunjuk kedua (contoh)."] });

export default function DevMissionAdminPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const sheet = {
    rooms: { C1: "A3", C2: "A4", R1: "B1" },
    people: [hod("Rani Contoh", "C1", "Departemen Contoh"), hod("Fajar Contoh", "C1", "Sales & Marketing"), hod("Dewi Contoh", "R1", "Finance"), hod("Sari Contoh", "R1", "HC"), hod("Tono Contoh", "C2", "Operasional")],
    bod: [{ name: "Bima Contoh", sents: [1], ceo: true }, { name: "Gita Contoh", sents: [2] }],
  };
  return <ConsoleShell theme="admin" area="Admin Pra WAM" storageKey="dev-misi" className={admin.shell} person={{ name: "Panitia Contoh", sub: "Werkudara" }}
    groups={[{ label: "Untuk peserta", items: [{ key: "misi", label: "Misi Perjalanan", href: "/dev-preview/admin-misi" }] }]} current="misi" pageTitle="Misi Perjalanan">
    <PraWamMission initial={{ sheet, migrated: true, saved: true, updatedAt: "2026-11-24T02:00:00Z", unmatched: ["Tono Contoh"] }} sessions={{ saved: true, ids: ["00000000-0000-4000-8000-000000000501"], choices: [
      { id: "00000000-0000-4000-8000-000000000501", title: "Meeting HoD BoD (contoh)", startsAt: "2026-11-24T08:00:00Z", status: "terbit" },
      { id: "00000000-0000-4000-8000-000000000502", title: "Forum evaluasi departemen (contoh)", startsAt: "2026-11-25T02:00:00Z", status: "terbit" },
      { id: "00000000-0000-4000-8000-000000000503", title: "Gudang Idea (contoh)", startsAt: null, status: "draf" },
    ] }} crumbs={[{ label: "Admin Pra WAM" }, { label: "Untuk peserta" }]} title="Misi Perjalanan" />
  </ConsoleShell>;
}
