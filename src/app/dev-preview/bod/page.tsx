import { notFound } from "next/navigation";
import { PraWamMcp } from "@/components/admin/wam/PraWamMcp";
import { BodSummary } from "@/components/pra-wam/BodSummary";
import { McpCard } from "@/components/pra-wam/McpCard";
import { AccountStatus, BodPeopleList, BodProfileView, ForumStatus } from "@/components/pra-wam/BodPeople";
import { attentionItems } from "@/lib/pra-wam/bod";
import type { BodInsights } from "@/lib/server/pra-wam/bod-insights";
import type { BodProfile, BodSummary as Summary, PeopleGroup } from "@/lib/server/pra-wam/dashboard";
import base from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";

const forum = (id: string, title: string, present: number, expected: number, startsAt: string, live = false) => ({ id: `00000000-0000-4000-8000-00000000000${id}`, title, present, expected, startsAt, live });
const forums = [
  forum("1", "Review data dept.", 55, 57, "2026-11-10T02:00:00Z"),
  forum("2", "Rekonsiliasi ACC", 52, 57, "2026-11-11T02:00:00Z"),
  forum("3", "Meeting budget", 49, 57, "2026-11-13T02:00:00Z"),
  forum("4", "HOD Meeting", 12, 12, "2026-11-24T02:00:00Z"),
  forum("5", "CSM & CAPEX", 44, 57, "2026-11-26T02:00:00Z", true),
];
const unit = (id: string, name: string, present: number, expected: number, leads: string[]) => ({ id, name, businessUnits: [], present, expected, leads, members: expected });
const sample: Summary = {
  migrated: true, attendanceReady: true, people: 57, departments: 12, businessUnits: 3,
  active: forums[4], accounts: 57, signedIn: 51, published: 9, drafts: 2, openRequests: 3, forums,
  units: [
    unit("a", "Sales & Marketing", 14, 18, []), unit("b", "Center of Excellence", 6, 6, ["Sofyan"]),
    unit("c", "Business & Administrative Services", 2, 2, ["Yulia"]), unit("d", "Art & Creative Support", 1, 3, ["Sofyan"]),
    unit("e", "Business Operations", 3, 4, []), unit("f", "Finance", 4, 5, []),
  ],
  attention: attentionItems({ lowUnits: ["Art & Creative Support"], openRequests: 3, drafts: 2, notSignedIn: 6, deadline: "2026-12-23", today: "2026-11-26" }),
};

const dates = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"];
const uses = [[6, 1], [8, 2], [5, 0], [9, 1], [4, 0], [7, 1], [10, 3], [8, 2], [6, 2], [3, 0], [2, 1], [4, 0], [1, 0], [0, 1], [0, 0]];
const insights: BodInsights = {
  today: "2026-11-26",
  phase: { name: "Pra WAM", startDate: "2026-10-28", endDate: "2026-12-23", daysToWam: 39, day: 30, days: 57 },
  sessions: [{ kind: "forum", published: 7, drafts: 2, cancelled: 0 }, { kind: "rapat", published: 4, drafts: 0, cancelled: 1 }, { kind: "acara", published: 1, drafts: 1, cancelled: 0 }],
  upcoming: [
    { id: "00000000-0000-4000-8000-000000000005", title: "CSM & CAPEX", kind: "forum", startsAt: "2026-11-26T07:00:00Z", endsAt: "2026-11-26T09:00:00Z", where: "Ruang Vasuki", participants: 57 },
    { id: "00000000-0000-4000-8000-000000000012", title: "Rapat sinkronisasi antardepartemen (ITEM)", kind: "rapat", startsAt: "2026-11-27T02:00:00Z", endsAt: "2026-11-27T04:00:00Z", where: "Ruang Antareja", participants: 14 },
    { id: "00000000-0000-4000-8000-000000000013", title: "Evaluasi departemen (ITAM)", kind: "forum", startsAt: "2026-12-01T02:00:00Z", endsAt: "2026-12-01T05:00:00Z", where: "Ruang Vasuki", participants: 57 },
  ],
  rooms: {
    days: dates.map((date, index) => ({ date, bookings: uses[index][0], sessions: uses[index][1], hours: uses[index][0] * 1.5 + uses[index][1] * 2 })),
    rooms: [{ id: "a", name: "Vasuki", uses: 18, hours: 31.5 }, { id: "b", name: "Antareja", uses: 22, hours: 27 }, { id: "c", name: "Nagini", uses: 14, hours: 16.5 }, { id: "d", name: "Pantry lantai 2", uses: 6, hours: 6 }, { id: "e", name: "Ruang tamu", uses: 4, hours: 3.5 }],
    outside: 3, total: 87, hours: 129.5,
  },
  checkIns: [{ way: "qr", count: 182 }, { way: "offline", count: 64 }, { way: "online", count: 21 }, { way: "manual", count: 9 }],
  adoption: [
    { name: "Art & Creative Support", people: 3, accounts: 3, signedIn: 1 }, { name: "Business Operations", people: 4, accounts: 4, signedIn: 3 },
    { name: "Sales & Marketing", people: 18, accounts: 18, signedIn: 15 }, { name: "Finance", people: 5, accounts: 5, signedIn: 5 },
  ],
  signedInWeek: 44,
  documents: { total: 23, general: 3, perSession: 20, recent: [
    { id: "d1", title: "Panduan Umum WAM", by: "Mido", at: "2026-11-25T03:00:00Z", session: null },
    { id: "d2", title: "Rencana anggaran 2027 Finance", by: "Yulia", at: "2026-11-24T08:00:00Z", session: "Meeting budget" },
    { id: "d3", title: "Data departemen Sales", by: "Sofyan", at: "2026-11-20T04:00:00Z", session: "Review data dept." },
  ] },
  announcements: { sent: 6, recipients: 342, read: 287, latest: { title: "Forum CSM & CAPEX pindah ke Vasuki", at: "2026-11-26T01:00:00Z", recipients: 57, read: 41 } },
  requests: { open: 3, approved: 11, rejected: 2, withdrawn: 1 },
  hod: { waiting: 1, scheduled: 4, rejected: 0, cancelled: 1 },
  businessUnits: [{ name: "Werkudara Event", people: 31, signedIn: 28 }, { name: "Werkudara Creative", people: 15, signedIn: 12 }, { name: "Werkudara Travel", people: 11, signedIn: 11 }],
};
const emptyInsights: BodInsights = { ...insights, upcoming: [], rooms: { days: dates.map(date => ({ date, bookings: 0, sessions: 0, hours: 0 })), rooms: [], outside: 0, total: 0, hours: 0 }, checkIns: [], adoption: [], signedInWeek: 0, documents: { total: 0, general: 0, perSession: 0, recent: [] }, announcements: { sent: 0, recipients: 0, read: 0, latest: null }, requests: { open: 0, approved: 0, rejected: 0, withdrawn: 0 }, hod: { waiting: 0, scheduled: 0, rejected: 0, cancelled: 0 }, businessUnits: [] };

const person = (id: string, name: string, jobTitle: string, account: PeopleGroup["people"][number]["account"], isLead = false) => ({ id: `00000000-0000-4000-8000-0000000001${id}`, name, jobTitle, isLead, account });
const groups: PeopleGroup[] = [
  { id: "a", name: "Sales & Marketing", businessUnits: ["WE"], leads: ["Sofyan"], people: [person("01", "Sofyan Hadi", "Head of Sales", "aktif", true), person("02", "Nadia Putri", "Account Executive", "aktif"), person("03", "Bima Arya", "Account Executive", "belum-masuk"), person("04", "Rina Sari", "Marketing", "tanpa-akun")] },
  { id: "b", name: "Finance", businessUnits: ["WG"], leads: ["Yulia"], people: [person("05", "Yulia Kartika", "Finance Manager", "aktif", true), person("06", "Dimas Pratama", "Accounting", "aktif")] },
  { id: "c", name: "Art & Creative Support", businessUnits: [], leads: [], people: [person("07", "Ayu Lestari", "Designer", "belum-masuk"), person("08", "Fajar Nugroho", "", "aktif")] },
];
const profile: BodProfile = {
  id: "00000000-0000-4000-8000-000000000101", name: "Sofyan Hadi Pranoto", department: "Sales & Marketing", position: "Head of Sales", roles: [],
  account: "aktif", units: [{ name: "Sales & Marketing", kind: "departemen", jobTitle: "Head of Sales", isLead: true }, { name: "WE", kind: "bu", jobTitle: "", isLead: false }],
  attendanceReady: true, upcoming: 2,
  forums: [{ id: forums[0].id, title: "Review data dept.", mark: "hadir" }, { id: forums[1].id, title: "Rekonsiliasi ACC", mark: "hadir" }, { id: forums[2].id, title: "Meeting budget", mark: "tidak-hadir" }, { id: forums[4].id, title: "CSM & CAPEX", mark: "berlangsung" }],
};

/**
 * Layout check for the BOD pages with sample numbers (Penpot "B1", "E3", status pills of "B2").
 * ?keadaan=kosong shows a summary before any forum; ?keadaan=absen, one before migration 05;
 * ?tema=gelap, the dark theme; ?halaman=peserta and ?halaman=profil, Peserta and Profil peserta.
 */
export default async function DevBodPage({ searchParams }: { searchParams: Promise<{ keadaan?: string; tema?: string; halaman?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { keadaan, tema, halaman } = await searchParams;
  if (halaman) return <div data-wam-theme={tema === "gelap" ? "dark" : "light"}><div className={base.app} style={{ minHeight: "100vh", padding: 20 }}>
    {halaman === "mcp" ? <div style={{ maxWidth: 640 }}><McpCard hasKey lastUsedAt="2026-11-26T03:12:00Z" calls={[{ title: "Ringkasan WAM", ok: true, createdAt: "2026-11-26T03:12:00Z" }, { title: "Hasil survei", ok: false, createdAt: "2026-11-26T03:10:00Z" }]} /></div>
      : halaman === "mcp-admin" ? <PraWamMcp crumbs={[]} title="Akses MCP" initial={{ migrated: true, candidates: [{ employeeId: "00000000-0000-4000-8000-000000000201", name: "Dimas Pratama", department: "Finance" }],
        rows: [{ employeeId: "00000000-0000-4000-8000-000000000101", name: "Fadli Fahmi Ali", department: "BOD", scopes: ["ringkasan", "sesi", "kehadiran", "survei"], grantedBy: "admin", grantedAt: "2026-11-06T03:00:00Z", revokedAt: null, hasKey: true, keyHint: "x9Qa", keyCreatedAt: "2026-11-06T04:00:00Z", lastUsedAt: "2026-11-26T03:12:00Z" },
          { employeeId: "00000000-0000-4000-8000-000000000102", name: "Yulia Kartika", department: "Finance", scopes: ["ringkasan"], grantedBy: "admin", grantedAt: "2026-11-06T03:00:00Z", revokedAt: "2026-11-20T03:00:00Z", hasKey: false, keyHint: null, keyCreatedAt: null, lastUsedAt: null }],
        recent: [{ id: 1, employeeId: "00000000-0000-4000-8000-000000000101", name: "Fadli Fahmi Ali", tool: "ringkasan", ok: true, createdAt: "2026-11-26T03:12:00Z" }] }} />
      : halaman === "profil" ? <BodProfileView person={profile} summary="Lead" viewerRole="BOD" /> : <BodPeopleList groups={groups} total={8} />}
  </div></div>;
  const data: Summary = keadaan === "kosong"
    ? { ...sample, active: null, forums: [], units: [], signedIn: 0, attention: [] }
    : keadaan === "absen" ? { ...sample, attendanceReady: false } : sample;
  return <div data-wam-theme={tema === "gelap" ? "dark" : "light"}><div className={base.app} style={{ minHeight: "100vh", padding: 20 }}>
    <BodSummary data={data} insights={keadaan === "kosong" ? emptyInsights : insights} greeting="Selamat pagi, Fadli" date="Kamis, 26 November"
      survey={keadaan === "kosong" ? null : { name: "Kuesioner personal WAM 2027", participation: { done: 38, active: 57 } }} mcp={keadaan === "kosong" ? null : { granted: true, hasKey: false }} />
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 24 }}>
      <AccountStatus state="aktif" /><AccountStatus state="belum-masuk" /><AccountStatus state="tanpa-akun" />
      <ForumStatus title="Review data" mark="hadir" /><ForumStatus title="Meeting budget" mark="tidak-hadir" /><ForumStatus title="HOD Meeting" mark="berlangsung" />
    </div>
  </div></div>;
}
