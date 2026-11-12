import { notFound } from "next/navigation";
import { TvBoard } from "@/components/tv/TvBoard";
import { sampleTvFeed, type SampleTvAsk } from "./sample";

export const dynamic = "force-dynamic";

/**
 * Layout check for the TV board without a TV key or the database: ?isi=banyak for a full day and
 * week (14 rooms), ?isi=kosong for no room in use, ?isi=gambar for pictures only, ?isi=sambutan for
 * two guests being welcomed (one with a cover photo, one typed), ?isi=dua for a TV laid out in two
 * rows (the playlist on top, photos running below), and
 * ?tema=werkudara for the Werkudara theme (Dream Out Loud otherwise), ?mode=terang for light, and
 * ?qr=kanan-bawah (or another corner) for the QR code. The clock is
 * fixed at 10.15 WIB on Tuesday 10 Nov 2026, so the "now" line and "Sedang berlangsung" show.
 * The same content for old TV browsers: /dev-preview/tv/lite.
 */
export default async function DevTvPage({ searchParams }: { searchParams: Promise<SampleTvAsk> }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <TvBoard initial={sampleTvFeed(await searchParams)} />;
}
