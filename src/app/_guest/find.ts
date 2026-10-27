import "server-only";
import { notFound, permanentRedirect } from "next/navigation";
import { readEventCode, isShortToken } from "@/lib/short-code";
import { getPublicEvent, getPublicEventByCode } from "@/lib/server/events";
import { eventPath } from "@/lib/routes";
import { findShortInvitation, getPersonalInvitation } from "@/lib/server/invitations";

/*
 * Route lookups for guest pages. A lowercase code is sent to its uppercase address; an unknown
 * code or token is a 404, never a hint about what exists.
 */

/** The published event behind `/{code}{suffix}`. */
export async function eventByCode(raw: string, suffix = "") {
  const read = readEventCode(raw);
  if (!read) notFound();
  if (!read.canonical) permanentRedirect(`/${read.code}${suffix}`);
  const event = await getPublicEventByCode(read.code);
  if (!event) notFound();
  return event;
}

/** A Friday Sharing opened by its bare code (`/AB23CD`, older links) moves to its friday-sharing address. */
export function sendFridaySharingHome<T extends { event_kind: string; code?: string | null; id: string; slug: string }>(event: T): T {
  if (event.event_kind === "csr") permanentRedirect(eventPath(event));
  return event;
}

/** Same, for link previews and metadata: no redirect, null when unknown. */
export async function eventByCodeQuietly(raw: string) {
  const read = readEventCode(raw);
  return read ? getPublicEventByCode(read.code).catch(() => null) : null;
}

/** Event and personal invitation behind `/{code}/{short}{suffix}`. */
export async function invitationByCode(raw: string, short: string, suffix = "") {
  const read = readEventCode(raw);
  if (!read || !isShortToken(short)) notFound();
  if (!read.canonical) permanentRedirect(`/${read.code}/${short}${suffix}`);
  const found = await findShortInvitation(read.code, short);
  if (!found) notFound();
  return personal(found.slug, found.token);
}

/** Event and personal invitation from the older `/e/{slug}/i/{token}` address. */
export async function personal(slug: string, token: string) {
  const invitation = await getPersonalInvitation(slug, token);
  if (!invitation) notFound();
  const event = await getPublicEvent(slug);
  if (!event || event.invitation_mode !== "personal") notFound();
  return { event, invitation };
}
