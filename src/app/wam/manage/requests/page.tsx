import { notFound } from "next/navigation";
import { PageHeader, PageTabs, type PageTab } from "@/components/console";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { RequestCards, type RequestItem } from "@/components/pra-wam/manage/RequestCards";
import { requestCheck, withQuery } from "@/components/pra-wam/manage/schedule";
import { Notice } from "@/components/ui";
import { wibDate } from "@/lib/pra-wam/appraisal";
import type { RequestStatus } from "@/lib/pra-wam/requests";
import { managesSessions } from "@/lib/pra-wam/roles";
import { sessionWhere, type RoomUse } from "@/lib/pra-wam/sessions";
import { praWamPath } from "@/lib/routes";
import { allRequests } from "@/lib/server/pra-wam/requests";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { listSessions, roomUses } from "@/lib/server/pra-wam/sessions";
import styles from "@/components/pra-wam/panitia.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Permintaan jadwal · WAM", robots: { index: false } };

type Tab = "menunggu" | "disetujui" | "ditolak" | "ditarik";
const statusOf: Record<Tab, RequestStatus> = { menunggu: "diajukan", disetujui: "disetujui", ditolak: "ditolak", ditarik: "ditarik" };
const empty: Record<Tab, string> = {
  menunggu: "Tidak ada permintaan yang menunggu.", disetujui: "Belum ada permintaan yang disetujui.",
  ditolak: "Belum ada permintaan yang ditolak.", ditarik: "Tidak ada permintaan yang ditarik.",
};

/** Panitia (Penpot "K2 · Tinjau permintaan", console "K4"): requests waiting for an answer, and the latest answered, by tab. */
export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const member = await requireMemberPage(praWamPath.requests);
  if (!managesSessions(member)) notFound();
  const [{ open, done, migrated }, { sessions }, asked] = await Promise.all([allRequests(member), listSessions(member), searchParams]);
  const all = [...open, ...done];
  const count = (tab: Tab) => all.filter(request => request.status === statusOf[tab]).length;
  // "Ditarik" only shows when someone has withdrawn one.
  const keys: Tab[] = ["menunggu", "disetujui", "ditolak", ...(count("ditarik") ? ["ditarik" as const] : [])];
  const tab: Tab = keys.find(key => key === asked.status) ?? "menunggu";
  const tabs: PageTab[] = keys.map(key => ({
    key, label: { menunggu: "Menunggu", disetujui: "Disetujui", ditolak: "Ditolak", ditarik: "Ditarik" }[key],
    href: key === "menunggu" ? praWamPath.requests : withQuery(praWamPath.requests, { status: key }),
    badge: key === "menunggu" && open.length ? String(open.length) : undefined, badgeLabel: "menunggu jawaban",
  }));

  const sessionOf = new Map(sessions.map(session => [session.id, session]));
  const shown = all.filter(request => request.status === statusOf[tab]);
  // What holds each asked day's rooms, to say whether the asked room is free.
  const days = tab === "menunggu" ? [...new Set(shown.map(request => wibDate(request.toStartsAt)))] : [];
  const uses = new Map<string, RoomUse[]>(await Promise.all(days.map(async day => [day, await roomUses(day).catch(() => [])] as [string, RoomUse[]])));
  const items: RequestItem[] = shown.map(request => {
    const session = sessionOf.get(request.sessionId);
    return {
      ...request, fromRoom: session ? sessionWhere(session) : "Tempat sesi",
      check: request.status === "diajukan" ? requestCheck(request, session, uses.get(wibDate(request.toStartsAt)) ?? []) : undefined,
    };
  });

  return <PraWamShell member={member} current="permintaan">
    <PageHeader title="Permintaan jadwal" subtitle="Menyetujui memindahkan sesi (bila ruangnya kosong) dan memberi tahu semua peserta. Menolak memberi tahu pengaju beserta catatanmu." />
    {!migrated ? <Notice tone="warning">Ganti jadwal menunggu migrasi 202611040007_pra_wam_schedule_requests.sql.</Notice> : <>
      <PageTabs label="Status permintaan" tabs={tabs} current={tab} />
      <RequestCards requests={items} emptyText={empty[tab]} />
      {tab !== "menunggu" && done.length >= 30 && <p className={styles.empty}>Menampilkan 30 jawaban terakhir.</p>}
    </>}
  </PraWamShell>;
}
