import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/shared/AdminShell";
import { BeoView } from "@/components/admin/beo/BeoView";
import { BeoPrint } from "@/components/admin/beo/BeoPrint";
import { beoDocument, beoVersionFromParam } from "@/lib/beo-document";
import { sampleBeo } from "./sample";

export const dynamic = "force-dynamic";

/** Layout check for the BEO with sample answers. ?status=set|final shows a locked BEO. Saving is refused without a session. */
export default async function DevBeoPage({ searchParams }: { searchParams: Promise<{ status?: string; cetak?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const { event, state, revisions, summary, brief } = sampleBeo(params.status);
  // ?cetak=lengkap|penyedia shows the print page with the sample data.
  if (params.cetak) return <BeoPrint eventId={event.id} doc={beoDocument(event, summary, state, revisions, beoVersionFromParam(params.cetak), brief.brief)} />;
  return <AdminShell bare><h1>BEO (contoh)</h1><BeoView event={event} summary={summary} initial={state} revisions={revisions} migrated brief={brief} /></AdminShell>;
}
