import { emptyAfter, emptyEmergency, emptyEnglish, emptyExperience, emptyPrepare, emptyRoute } from "./validation";
import type { EventRecord, HeroFraming, HeroImage, PhotoFrame } from "./types";
import { normalizePoster } from "./poster";
import { emptyGuide } from "./guide";
import { normalizeDonation } from "./donations";
import { normalizeTrip } from "./trip";

export function defaultFraming(focus: HeroImage["focus"] = "center"): HeroFraming {
  const frame = { x: 50, y: focus === "top" ? 0 : focus === "bottom" ? 100 : 50, zoom: 1 };
  return { mobile: { ...frame }, desktop: { ...frame } };
}
export function getFraming(hero: HeroImage): HeroFraming {
  return hero.framing ?? defaultFraming(hero.focus);
}
export function normalizeEvent(event: EventRecord): EventRecord {
  return {
    ...event,
    invitation_mode: event.invitation_mode ?? "open",
    contact: {
      name: event.contact?.name ?? "", phone: event.contact?.phone ?? "", channel: event.contact?.channel ?? "whatsapp",
      heading: event.contact?.heading ?? "", description: event.contact?.description ?? "",
      role: event.contact?.role ?? "", organization: event.contact?.organization ?? "",
      photo: event.contact?.photo ?? { url: "", alt: "", srcset: [] }, staff_id: event.contact?.staff_id ?? "",
    },
    review_heading: event.review_heading ?? "", review_description: event.review_description ?? "", review_button_label: event.review_button_label ?? "",
    feedback_description: event.feedback_description ?? "", team_image: event.team_image ?? { url: "", alt: "", srcset: [] },
    event_kind: event.event_kind ?? "acara", audience: event.audience ?? "external",
    theme: { key: event.theme?.key ?? "werkudara", corners: event.theme?.corners ?? "square" },
    phase_override: event.phase_override ?? "auto",
    experience: { ...emptyExperience, ...event.experience }, route: { ...emptyRoute, ...event.route },
    day_note: event.day_note ?? "", day_enabled: event.day_enabled ?? true, after: { ...emptyAfter, ...event.after, collaboration: { ...emptyAfter.collaboration, ...event.after?.collaboration } },
    location_embed_url: event.location_embed_url ?? "", location_display: event.location_display ?? (event.location_embed_url ? "embed" : "manual"),
    hero: { ...event.hero, framing: getFraming(event.hero) },
    // Fields added on 20 Oct: documents saved before then do not carry them.
    prepare: { ...emptyPrepare, ...event.prepare, items: event.prepare?.items ?? [] },
    language: event.language ?? "id",
    translations: { en: { ...emptyEnglish, ...event.translations?.en, agenda: event.translations?.en?.agenda ?? {} } },
    guest_estimate: event.guest_estimate ?? null,
    agenda_details: event.agenda_details ?? {}, presentation_pdf_url: event.presentation_pdf_url ?? "",
    emergency: { ...emptyEmergency, ...event.emergency },
    poster: normalizePoster(event.poster),
    // E-Guide (26 Oct): older documents carry no guide.
    donation: normalizeDonation(event.donation),
    // Trip handbook parts (30 Oct): older documents carry none.
    trip: normalizeTrip(event.trip),
    client_logo: event.client_logo ?? { url: "", alt: "", srcset: [] },
    about_image: event.about_image ?? { url: "", alt: "", srcset: [] },
    guide: { ...emptyGuide(), ...event.guide, cover: { ...emptyGuide().cover, ...event.guide?.cover }, chapters: event.guide?.chapters ?? [], order: event.guide?.order ?? [] },
  };
}
/**
 * Moves a framed photo by a drag of dx, dy pixels. Along a side where the photo is larger than the
 * box, x/y pick the crop; where it is smaller (a photo zoomed out below "cover"), they move it
 * inside the box. Either way it follows the finger and stops at the box's edges.
 */
export function dragFrame(frame: PhotoFrame, dx: number, dy: number, width: number, height: number, naturalWidth: number, naturalHeight: number): PhotoFrame {
  const cover = Math.max(width / naturalWidth, height / naturalHeight) * frame.zoom;
  // Signed: positive when the photo overflows the box, negative when it is smaller than it.
  const slackX = naturalWidth * cover - width;
  const slackY = naturalHeight * cover - height;
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  return { ...frame, x: Math.abs(slackX) > 0.01 ? clamp(frame.x - dx / slackX * 100) : frame.x, y: Math.abs(slackY) > 0.01 ? clamp(frame.y - dy / slackY * 100) : frame.y };
}
