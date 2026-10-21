import { emptyAfter, emptyEmergency, emptyEnglish, emptyExperience, emptyPrepare, emptyRoute } from "./validation";
import type { EventRecord, HeroFraming, HeroImage, PhotoFrame } from "./types";

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
    },
    review_heading: event.review_heading ?? "", review_description: event.review_description ?? "", review_button_label: event.review_button_label ?? "",
    feedback_description: event.feedback_description ?? "", team_image: event.team_image ?? { url: "", alt: "", srcset: [] },
    event_kind: event.event_kind ?? "acara", audience: event.audience ?? "external",
    theme: { key: event.theme?.key ?? "werkudara", corners: event.theme?.corners ?? "square" },
    phase_override: event.phase_override ?? "auto",
    experience: { ...emptyExperience, ...event.experience }, route: { ...emptyRoute, ...event.route },
    day_note: event.day_note ?? "", after: { ...emptyAfter, ...event.after, collaboration: { ...emptyAfter.collaboration, ...event.after?.collaboration } },
    location_embed_url: event.location_embed_url ?? "", location_display: event.location_display ?? (event.location_embed_url ? "embed" : "manual"),
    hero: { ...event.hero, framing: getFraming(event.hero) },
    // Fields added on 20 Oct: documents saved before then do not carry them.
    prepare: { ...emptyPrepare, ...event.prepare, items: event.prepare?.items ?? [] },
    language: event.language ?? "id",
    translations: { en: { ...emptyEnglish, ...event.translations?.en, agenda: event.translations?.en?.agenda ?? {} } },
    guest_estimate: event.guest_estimate ?? null,
    agenda_details: event.agenda_details ?? {}, presentation_pdf_url: event.presentation_pdf_url ?? "",
    emergency: { ...emptyEmergency, ...event.emergency },
  };
}
export function dragFrame(frame: PhotoFrame, dx: number, dy: number, width: number, height: number, naturalWidth: number, naturalHeight: number): PhotoFrame {
  const cover = Math.max(width / naturalWidth, height / naturalHeight) * frame.zoom;
  const overflowX = Math.max(0, naturalWidth * cover - width);
  const overflowY = Math.max(0, naturalHeight * cover - height);
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  return { ...frame, x: overflowX > 0 ? clamp(frame.x - dx / overflowX * 100) : frame.x, y: overflowY > 0 ? clamp(frame.y - dy / overflowY * 100) : frame.y };
}
