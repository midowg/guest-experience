import { beoDocument, beoVersionFromParam } from "@/lib/beo-document";
import { beoPdf } from "@/lib/server/beo-pdf";
import { sampleBeo } from "../sample";

export const dynamic = "force-dynamic";

/** Development-only: the sample BEO as PDF (?versi=penyedia|internal&status=set). */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const { event, state, revisions, summary } = sampleBeo(url.searchParams.get("status") ?? undefined);
  const bytes = await beoPdf(beoDocument(event, summary, state, revisions, beoVersionFromParam(url.searchParams.get("versi"))));
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf" } });
}
