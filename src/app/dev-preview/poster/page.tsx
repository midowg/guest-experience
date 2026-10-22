import { notFound } from "next/navigation";
import { PosterPage } from "@/components/poster/PosterPage";
import { presetPoster } from "@/lib/poster-presets";
import { createSeedEvent } from "@/lib/seed-event";

export const dynamic = "force-dynamic";

/**
 * Layout check for Studio Poster with sample data. Nothing is saved anywhere; the draft stays in
 * this browser. ?desain=rempah-nusantara|ucapan-hangat|name-tag|sertifikat-klasik|undangan-sederhana
 * ?warna=rempah|werkudara|malam|segar|senja · ?pilih=1 lets the visitor pick colours · ?kosong=1
 * starts without the event's values.
 */
export default async function DevPosterPage({ searchParams }: { searchParams: Promise<{ kosong?: string; desain?: string; warna?: string; pilih?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const empty = params.kosong === "1";
  const event = {
    ...createSeedEvent(), id: "10f3a511-2331-4000-8000-0000000000ff", title: "JCWF 2026", event_kind: "kartu" as const,
    theme: { key: "rempah" as const, corners: "square" as const },
    starts_at: "2026-11-07T04:30:00.000Z", ends_at: "2026-11-07T05:30:00.000Z", timezone: "Asia/Jakarta", venue_name: empty ? "" : "Loman Park Hotel\nYogyakarta",
  };
  const poster = presetPoster(params.desain ?? "rempah-nusantara", event);
  if (params.warna) poster.palette = params.warna;
  poster.paletteChoice = params.pilih === "1";
  poster.fields = poster.fields.map(field =>
    field.key === "reservation" ? { ...field, value: "Reservasi & informasi\natourin.com/en/jcwf2026" }
    : field.key === "socials" ? { ...field, value: "@jcwf.id | jcwf.id" }
    : field.key === "signer1_name" ? { ...field, value: "Contoh Raka Pratama" } : field.key === "signer1_role" ? { ...field, value: "Ketua Panitia" }
    : field.key === "signer2_name" ? { ...field, value: "Contoh Sari Dewi" } : field.key === "signer2_role" ? { ...field, value: "Direktur" }
    : empty && field.editable ? { ...field, value: "" } : field);
  // Each design keeps its own draft, so switching designs here never mixes their boxes.
  return <PosterPage event={{ ...event, id: `10f3a511-2331-4000-8000-${(poster.preset.length * 7919).toString(16).padStart(12, "0").slice(-12)}`, poster }} />;
}
