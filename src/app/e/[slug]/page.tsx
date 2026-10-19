import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventExperience } from "@/components/guest/EventExperience";
import { getPublicEvent } from "@/lib/server/events";
import { isSupabaseConfigured } from "@/lib/server/config";
import { Notice } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { currentPhase } from "@/lib/event-phase";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  if (!isSupabaseConfigured()) return { title: "Undangan", robots: { index: false, follow: false } };
  const event = await getPublicEvent((await params).slug).catch(() => null);
  if (!event) return { title: "Undangan", robots: { index: false, follow: false } };
  return {
    title: event.title,
    description: `${event.title} — ${formatDate(event.starts_at, event.timezone)}${event.venue_name ? `, ${event.venue_name}` : ""}.`,
    robots: { index: false, follow: false },
  };
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSupabaseConfigured()) {
    return <main className="container landing"><div className="stack landing-inner">
      <p className="eyebrow">Undangan belum dapat dimuat</p>
      <h1>Mohon maaf, informasi acara belum tersedia.</h1>
      <Notice>Koneksi penyimpanan belum dikonfigurasi, sehingga isi undangan tidak dapat ditampilkan. Tidak ada data contoh yang ditampilkan sebagai pengganti. Hubungi penyelenggara acara.</Notice>
    </div></main>;
  }
  const event = await getPublicEvent(slug);
  if (!event) notFound();
  return <EventExperience event={event} phase={currentPhase(event)} />;
}
