import { formatDateTime } from "./format";
import type { EventRecord } from "./types";
import { t, type Lang } from "./wording";

export type MessageKind = "invite" | "reminder";

export function invitationLink(origin: string, slug: string, token: string) {
  return `${origin}/e/${encodeURIComponent(slug)}/i/${token}`;
}

/** The guest reads the message in the event's language; a bilingual event writes Indonesian. */
export function messageLang(event: Pick<EventRecord, "language">): Lang {
  return event.language === "en" ? "en" : "id";
}

export function invitationMessage(kind: MessageKind, event: Pick<EventRecord, "title" | "starts_at" | "timezone" | "rsvp_closes_at" | "language" | "translations">, guest: { name: string }, link: string): string {
  const lang = messageLang(event);
  const title = (lang === "en" && event.translations?.en.title) || event.title;
  const vars = { name: guest.name, event: title, link, when: event.starts_at ? formatDateTime(event.starts_at, event.timezone, lang) : "", deadline: event.rsvp_closes_at ? formatDateTime(event.rsvp_closes_at, event.timezone, lang) : "" };
  if (kind === "invite") return t(lang, "wa.invite", vars);
  return t(lang, event.rsvp_closes_at ? "wa.reminder" : "wa.reminder.open", vars);
}

/** wa.me opens a chat with the text filled in; the admin still presses Send in WhatsApp. */
export function whatsappUrl(phone: string | null, text: string) {
  return `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(text)}`;
}
