import { notFound } from "next/navigation";
import { linkPreview } from "@/lib/server/link-preview";
import type { EventRecord } from "@/lib/types";
import { sampleCsr } from "../csr/sample";

export const dynamic = "force-dynamic";

/** The link preview card for a made-up event: ?jenis=csr (default), kunjungan, acara, kartu or eguide. */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") notFound();
  const kind = (new URL(request.url).searchParams.get("jenis") ?? "csr") as EventRecord["event_kind"];
  const { event } = sampleCsr({});
  return linkPreview({ ...event, event_kind: kind, theme: kind === "csr" ? event.theme : { key: "werkudara", corners: "square" } });
}
