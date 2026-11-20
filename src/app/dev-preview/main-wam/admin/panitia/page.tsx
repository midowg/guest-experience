import { notFound } from "next/navigation";
import { PageHeader } from "@/components/console";
import { StaffAdmin } from "@/components/admin/wam-acara/StaffAdmin";
import { wamAcaraCrumbs, wamAcaraSection } from "@/components/admin/wam-acara/sections";
import { samplePeople } from "@/lib/main-wam/sample";
import type { WamStaffBoard } from "@/lib/server/main-wam/staff";
import { AdminPreviewFrame, previewFlags } from "../Frame";

export const dynamic = "force-dynamic";

const at = "2026-11-20T03:00:00Z";
const member = (key: string, seksi: string, hasAccount = true) => ({
  employeeId: samplePeople[key].id, fullName: samplePeople[key].fullName, department: samplePeople[key].department, seksi, grantedAt: at, grantedBy: "Admin Contoh", hasAccount,
});

/** Admin WAM 2027 → Panitia WAM with sample people, no sign-in, 404 in production: ?isi=kosong, ?migrasi=belum, ?acara=belum (no WAM event). Saving calls the real API, which refuses without an admin session. */
export default async function DevAdminPanitia({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const { waiting, empty } = previewFlags(params);
  const board: WamStaffBoard = {
    migrated: !waiting,
    event: params.acara === "belum" ? null : { id: "00000000-0000-4000-8000-0000000000ee", name: "WAM 2026" },
    staff: empty || waiting ? [] : [member("dimas", "Acara"), member("ayu", "Acara"), member("putri", "Kamar"), member("gilang", "Dokumentasi"), member("hana", "Konsumsi", false), member("raka", "")],
  };
  const people = Object.values(samplePeople).filter(person => person.department !== "BOD").map(person => ({ id: person.id, fullName: person.fullName, department: person.department }));
  return <AdminPreviewFrame current="panitia">
    <PageHeader crumbs={wamAcaraCrumbs("panitia")} title={wamAcaraSection("panitia").label}
      subtitle="Panitia acara WAM, dengan seksinya. Terpisah dari panitia Pra WAM: peran Panitia di Admin Pra WAM tidak berlaku di Main WAM." />
    <StaffAdmin key={JSON.stringify(params)} initial={board} people={people} />
  </AdminPreviewFrame>;
}
