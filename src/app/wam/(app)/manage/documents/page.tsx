import { notFound } from "next/navigation";
import { PageHeader } from "@/components/console";
import { DocumentList } from "@/components/pra-wam/DocumentList";
import { Notice } from "@/components/ui";
import { managesSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { listDocuments } from "@/lib/server/pra-wam/documents";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { listSessions } from "@/lib/server/pra-wam/sessions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dokumen · Kelola acara · WAM", robots: { index: false } };

/**
 * Kelola acara → Dokumen (9 Nov 2026): the panitia upload documents for everyone and materials for
 * any session here. The participant app's Dokumen only lists them; uploading moved out of it.
 */
export default async function ManageDocumentsPage() {
  const member = await requireMemberPage(praWamPath.manageDocuments);
  if (!managesSessions(member)) notFound();
  const [{ documents, migrated, storage }, { sessions }] = await Promise.all([listDocuments(member), listSessions(member)]);
  return <>
    <PageHeader title="Dokumen" subtitle="Unggah dokumen umum untuk semua peserta, atau materi untuk satu sesi." />
    {!migrated ? <Notice tone="warning">Dokumen menunggu migrasi 202611040004_pra_wam_sessions.sql.</Notice>
      : <DocumentList documents={documents} grouped viewerName={member.name} canUpload storage={storage}
        sessions={sessions.filter(session => session.status !== "batal").map(({ id, title }) => ({ id, title }))} />}
  </>;
}
