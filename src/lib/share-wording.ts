import { formatDate } from "./format";
import type { EventRecord } from "./types";

/**
 * What a shared link says, per kind of event: the small label on the preview card, and the
 * description WhatsApp and other apps show under the title. An invitation names its date and
 * place; a card, an E-Guide and a Friday Sharing page say what the reader can do there instead.
 * Never a guest's name.
 */
export type ShareWording = { label: string; description: string; details: string[] };

type Kind = EventRecord["event_kind"];
const labels: Record<Kind, { id: string; en: string }> = {
  kunjungan: { id: "Undangan kunjungan", en: "Visit invitation" },
  acara: { id: "Undangan", en: "Invitation" },
  program: { id: "Panduan peserta", en: "Participant guide" },
  kartu: { id: "Kartu", en: "Card" },
  eguide: { id: "E-Guide", en: "E-Guide" },
  csr: { id: "Friday Sharing", en: "Friday Sharing" },
  panduan: { id: "Panduan lokasi", en: "Visitor guide" },
};

export function shareWording(event: Pick<EventRecord, "event_kind" | "title" | "subtitle" | "organizer" | "starts_at" | "timezone" | "venue_name" | "language">): ShareWording {
  const english = event.language === "en";
  const label = labels[event.event_kind]?.[english ? "en" : "id"] ?? labels.acara.id;
  const subtitle = event.subtitle?.trim() ?? "";
  if (event.event_kind === "csr") {
    const invite = `Yuk, ikut berbagi bersama ${event.organizer || "kami"}: donasi dana atau barang, dan lihat yang sudah terkumpul.`;
    return { label, description: subtitle ? `${subtitle}. ${invite}` : invite, details: subtitle ? [subtitle] : [] };
  }
  if (event.event_kind === "eguide") {
    const read = english ? "A digital guide: places, culture, schedule and what to prepare." : "Panduan digital: tempat, budaya, jadwal, dan persiapan.";
    return { label, description: subtitle ? `${subtitle}. ${read}` : read, details: subtitle ? [subtitle] : [] };
  }
  if (event.event_kind === "panduan") {
    const find = english ? `How to find ${event.venue_name || "us"}: the route, where to park and who to ask.` : `Cara menuju ${event.venue_name || "lokasi"}: rute, parkir, dan siapa yang bisa ditanya.`;
    return { label, description: subtitle ? `${subtitle}. ${find}` : find, details: [event.venue_name].filter(Boolean) };
  }
  if (event.event_kind === "kartu") {
    const make = english ? "Fill in your details, then download and share your card." : "Isi data Anda, lalu unduh dan bagikan kartunya.";
    return { label, description: subtitle ? `${subtitle}. ${make}` : make, details: subtitle ? [subtitle] : [] };
  }
  const when = event.starts_at ? formatDate(event.starts_at, event.timezone) : "";
  const details = [when, event.venue_name].filter(Boolean);
  return { label, description: [label, ...details].join(" · "), details };
}
