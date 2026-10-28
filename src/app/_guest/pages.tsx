import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { z } from "zod";
import { CsrExperience } from "@/components/guest/csr/CsrExperience";
import { publicDonationView } from "@/lib/server/donations";
import { EventExperience } from "@/components/guest/EventExperience";
import { GuidePage } from "@/components/guest/GuidePage";
import { PlaceGuide } from "@/components/guest/PlaceGuide";
import { PhotoGallery } from "@/components/guest/PhotoGallery";
import { PosterPage as PosterView } from "@/components/poster/PosterPage";
import { TicketView, type TicketData } from "@/components/guest/TicketView";
import { Notice } from "@/components/ui";
import { currentPhase } from "@/lib/event-phase";
import { shareWording } from "@/lib/share-wording";
import { galleryOpen } from "@/lib/gallery";
import { buildCalendar, calendarFileName, reminderChoices, type CalendarScope } from "@/lib/ics";
import { absolute, eventPath, invitationPath, ticketPath } from "@/lib/routes";
import { siteUrl } from "@/lib/site-url";
import { ticketScanUrl } from "@/lib/tickets";
import type { EventRecord } from "@/lib/types";
import { afterPhotos, listPublicPhotos, originalDownload } from "@/lib/server/gallery";
import type { PersonalInvitation } from "@/lib/server/invitations";
import { openPartyMax, rsvpNeedsReady } from "@/lib/server/responses";
import { ensureTicket } from "@/lib/server/tickets";

/*
 * Guest pages, shared by the short addresses (/AB23CD/…) and the older /e/{slug}/… ones. The
 * route files only find the event and invitation, then hand them here.
 */

const hidden = { index: false, follow: false } as const;

/**
 * Title, description and WhatsApp preview text, worded for the kind of event (an invitation, a
 * card, an E-Guide, a Friday Sharing page). Never the guest's name, so a forwarded link shows
 * nothing personal.
 */
export function eventMetadata(event: EventRecord | null, personal = false): Metadata {
  const base: Metadata = { title: personal ? "Undangan personal" : "Werkudara", robots: hidden, ...(personal ? { referrer: "no-referrer" as const } : {}) };
  if (!event) return base;
  const { description } = shareWording(event);
  return { ...base, title: event.title, description, openGraph: { title: event.title, description, type: "website", siteName: "Werkudara" } };
}

export function StorageMissing() {
  return <main className="container landing"><div className="stack landing-inner">
    <p className="eyebrow">Undangan belum dapat dimuat</p>
    <h1>Mohon maaf, informasi acara belum tersedia.</h1>
    <Notice>Koneksi penyimpanan belum dikonfigurasi, sehingga isi undangan tidak dapat ditampilkan. Tidak ada data contoh yang ditampilkan sebagai pengganti. Hubungi penyelenggara acara.</Notice>
  </div></main>;
}

export async function EventPage({ event }: { event: EventRecord }) {
  if (event.event_kind === "kartu") return <PosterPage event={event} />;
  if (event.event_kind === "eguide") return <GuidePage event={event} />;
  if (event.event_kind === "panduan") return <PlaceGuide event={event} />;
  if (event.event_kind === "csr") return <CsrExperience event={event} view={await publicDonationView(event)} />;
  return <EventExperience event={event} phase={currentPhase(event)} rsvpNeeds={await rsvpNeedsReady()} openPartyMax={await openPartyMax()} photoCount={await afterPhotos(event)} />;
}

export async function InvitationPage({ event, invitation }: { event: EventRecord; invitation: PersonalInvitation }) {
  return <EventExperience event={event} invitation={invitation} phase={currentPhase(event)} rsvpNeeds={await rsvpNeedsReady()} photoCount={await afterPhotos(event)} />;
}

/** The thank-you page: the after-the-event view, sent by the host when the visit is over. */
export async function ThanksPage({ event, invitation }: { event: EventRecord; invitation?: PersonalInvitation }) {
  if (event.event_kind === "kartu" || event.event_kind === "eguide" || event.event_kind === "csr" || event.event_kind === "panduan") notFound();
  return <EventExperience event={event} invitation={invitation} phase="after" rsvpNeeds={await rsvpNeedsReady()} photoCount={await afterPhotos(event)} />;
}

/** The entry ticket, issued the first time it is opened after a yes. */
export async function TicketPage({ event, invitation }: { event: EventRecord; invitation: PersonalInvitation }) {
  if (invitation.rsvp?.attendance !== "yes") return <TicketView event={event} ticket={null} reason="not-attending" />;
  const ticket = await ensureTicket(invitation.rsvp.id);
  if (!ticket) return <TicketView event={event} ticket={null} reason="unavailable" />;
  const origin = siteUrl().origin;
  const scan = ticketScanUrl(origin, ticket.code);
  const options = { errorCorrectionLevel: "M" as const, margin: 1, color: { dark: "#111111", light: "#ffffff" } };
  const data: TicketData = {
    name: invitation.rsvp.name || invitation.name,
    partySize: Math.max(1, invitation.rsvp.party_size ?? 1),
    qrSvg: await QRCode.toString(scan, { ...options, type: "svg" }),
    qrPng: await QRCode.toDataURL(scan, { ...options, width: 600 }),
    pageUrl: absolute(origin, ticketPath(event, invitation)),
    backUrl: invitationPath(event, invitation),
  };
  return <TicketView event={event} ticket={data} reason="ready" />;
}

/** Studio Poster: when the admin switched it on (always, for a card event) and it has boxes. */
export function PosterPage({ event }: { event: EventRecord }) {
  if (!(event.poster?.enabled || event.event_kind === "kartu") || !event.poster?.fields.length) notFound();
  return <PosterView event={event} />;
}

/** Ready photos; the gallery closes six months after the event. */
export async function GalleryPage({ event }: { event: EventRecord }) {
  const open = galleryOpen(event);
  return <PhotoGallery event={event} photos={open ? await listPublicPhotos(event.id) : []} closed={!open} />;
}

/** ?cakupan=semua|hari-ini&ingat=15|30|60. The file links to the general page, never a personal one. */
export function calendarResponse(request: Request, event: EventRecord): Response {
  const url = new URL(request.url);
  const scope: CalendarScope = url.searchParams.get("cakupan") === "hari-ini" ? "today" : "all";
  const asked = Number(url.searchParams.get("ingat"));
  const remind = (reminderChoices as readonly number[]).includes(asked) ? asked : 30;
  const body = buildCalendar(event, { scope, remind, pageUrl: absolute(url.origin, eventPath(event)), host: url.hostname });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${calendarFileName(event.slug, scope)}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

/** Redirect to a one-hour address for the original of a ready photo. */
export async function photoDownloadResponse(event: EventRecord | null, photoId: string): Promise<Response> {
  const missing = () => new Response("Foto tidak ditemukan.", { status: 404 });
  if (!event || !galleryOpen(event) || !z.uuid().safeParse(photoId).success) return missing();
  const url = await originalDownload(event.id, photoId, event.slug).catch(() => null);
  if (!url) return missing();
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
