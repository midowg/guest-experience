import "server-only";
import { bookingTopic } from "@/lib/pra-wam/push";
import type { Session } from "@/lib/pra-wam/sessions";
import { isR2Configured, removeObjects } from "../r2";
import { createPrivilegedClient } from "../supabase/admin";
import { notifySession } from "./announcements";
import type { Member } from "./session";

/*
 * A room booking is also a published session (migration 202611050004). The database keeps the
 * two in step (triggers on the booking and its participants, in the same transaction as the
 * booking), so a booking is never saved without its session or the other way round. What is left
 * for the server: telling the participants, and cleaning up after a booking deleted for good.
 * Before that migration there is no link, every read here finds nothing, and booking works as
 * it always did.
 */

/** The link column is not in the database yet (before 202611050004). */
export const bookingLinkMissing = (error: { code?: string; message?: string }) =>
  ["42703", "PGRST204"].includes(error.code ?? "") && /booking_id/.test(error.message ?? "");

type Read<T> = PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>;

/**
 * Reads with the booking link (`withLink`), or without it before the migration: the same query
 * built twice, so callers need not care which database they talk to.
 */
export async function withBookingLink<T>(read: (withLink: boolean) => Read<T>): Promise<{ data: T | null; error: { code?: string; message: string } | null; linked: boolean }> {
  const first = await read(true);
  if (first.error && bookingLinkMissing(first.error)) return { ...(await read(false)), linked: false };
  return { ...first, linked: true };
}

/** The session a booking became; null when it has none, or before the migration. */
export async function sessionOfBooking(bookingId: string): Promise<{ id: string } | null> {
  const { data, error } = await createPrivilegedClient().from("pw_sessions").select("id").eq("booking_id", bookingId).maybeSingle();
  return error || !data ? null : { id: data.id as string };
}

/** What a note about the booking's session says (the session's own words, from the booking). */
export type BookingFacts = Pick<Session, "title" | "startsAt" | "endsAt" | "roomName">;

/**
 * Tells the session's participants that the booking became a session, moved, or was cancelled,
 * as panitia's sessions do, except whoever did it (the booker knows). On the phone only as its
 * booking topic: a new booking as booking_baru, a move or cancel within 24 hours as booking_penting,
 * a later one the bell only. Never throws: the booking is saved either way.
 */
export async function notifyBookingSession(bookingId: string, change: "terbit" | "berubah" | "batal", facts: BookingFacts, by: Member): Promise<void> {
  try {
    const session = await sessionOfBooking(bookingId);
    if (!session) return;
    // A booking always has its time; without one, a change is not urgent.
    const topic = facts.startsAt ? bookingTopic(change, facts.startsAt, new Date()) : change === "terbit" ? "booking_baru" : null;
    await notifySession({ ...facts, id: session.id, planFrom: null, planTo: null, location: "" }, change, by, { except: by.id, topic });
  } catch { /* the booking is saved either way */ }
}

/**
 * Deletes a booking for good, and with it its session (the database cascades). The session's
 * document files and notifications would point nowhere afterwards, so they go too, as
 * deleteSession does; they are looked up first because the cascade takes the links with it.
 * Returns the database error of the delete, if any (nothing is cleaned up then).
 */
export async function deleteBookingAndSession(bookingId: string): Promise<{ code?: string; message: string } | null> {
  const client = createPrivilegedClient();
  const session = await sessionOfBooking(bookingId);
  const [files, notes] = session
    ? await Promise.all([
      client.from("pw_documents").select("file_key").eq("session_id", session.id),
      // Before the announcements migration there is nothing to remove, so its error is not a failure.
      client.from("pw_announcements").select("id").eq("session_id", session.id),
    ])
    : [{ data: null }, { data: null }];
  const { error } = await client.from("pw_room_bookings").delete().eq("id", bookingId);
  if (error) return error;
  const keys = (files.data ?? []).map(file => file.file_key as string);
  if (keys.length && isR2Configured()) await removeObjects(keys).catch(() => undefined);
  const ids = (notes.data ?? []).map(note => note.id as string);
  if (ids.length) await client.from("pw_announcements").delete().in("id", ids);
  return null;
}
