import "server-only";
import { createHash } from "node:crypto";
import { dayStart, wibDay } from "@/lib/coffee/quota";
import { ROOMS, roomSpot } from "@/lib/coffee/rooms";
import type { MeetingInput } from "@/lib/coffee/schemas";
import type { GaState, MeetingOrder } from "@/lib/coffee/types";
import { ServiceError } from "../config";
import type { Member } from "../pra-wam/session";
import { activePeople } from "./people";
import { gaPinSet } from "./pin";
import { ORDER_COLUMNS, coffeeError, db, orderById, toMeetingOrder, toOrder, type OrderRow } from "./store";

/*
 * Mode GA (/coffee/ga): meeting orders for guests and the team in the room. No quota: a guest's
 * drink is recorded under the PIC, a team member's under that person. The tablet is shared, so it
 * shows every meeting order of today, whoever sent it.
 */

export async function gaState(_member: Member, now = new Date()): Promise<GaState> {
  const [found, people, pin] = await Promise.all([
    db().from("coffee_orders").select(ORDER_COLUMNS).eq("kind", "rapat").gte("ordered_at", dayStart(wibDay(now.toISOString()))).order("ordered_at", { ascending: false }).limit(300),
    activePeople(),
    gaPinSet(),
  ]);
  if (found.error) coffeeError(found.error);
  return {
    today: ((found.data ?? []) as unknown as OrderRow[]).map(row => toMeetingOrder(toOrder(row))),
    people: people.map(({ id, name, position, bu }) => ({ id, name, position, bu })),
    rooms: ROOMS.map(room => ({ ...room })),
    pin,
  };
}

/**
 * What a key was sent with: the room, the PIC, the first sending it adds to, and the drinks. The
 * database keeps it with the order and refuses the same key with another fingerprint (409), so
 * drinks added to an order whose answer was lost are never taken for "already sent".
 */
export function requestPrint(input: MeetingInput): string {
  const items = input.items.map(item => [item.for, item.personId ?? "", item.guestName ?? "", item.slug, item.temperature, item.sugar, item.ice, item.qty]);
  return createHash("sha256").update(JSON.stringify([input.parentId ? "" : input.room, input.parentId ? "" : input.picId, input.parentId ?? "", items])).digest("hex");
}

/**
 * One sending of a meeting order; with `parentId` ("Tambah lagi") it is the next round of the same
 * meeting. For a next round the database takes the PIC, room, guest and guest count from the first
 * round (of today, not refused): what is sent for them here is not read.
 */
export async function submitMeeting(member: Member, input: MeetingInput, now = new Date()): Promise<{ order: MeetingOrder }> {
  const print = requestPrint(input);
  const { data, error } = await db().rpc("coffee_submit_meeting", {
    p_order: {
      pic_id: input.picId, room: input.room, room_spot: roomSpot(input.room), guest: input.guest ?? null, guest_count: input.guestCount ?? null,
      parent_id: input.parentId ?? null, actor_id: member.id, actor_label: (member.nickname || member.name).slice(0, 120), ordered_at: now.toISOString(), manual: false, print,
    },
    p_items: input.items.map(item => ({ for: item.for, person_id: item.personId ?? null, guest_name: item.guestName ?? null, slug: item.slug, temperature: item.temperature, sugar: item.sugar, ice: item.ice, qty: item.qty })),
    p_key: input.key,
  });
  let id = data as string | null;
  if (error) {
    // Two sendings of the same key met at the unique index: the first one is the order.
    const { data: first } = error.code === "23505" ? await db().from("coffee_orders").select("id,request_print").eq("idempotency_key", input.key).eq("kind", "rapat").in("status", ["diproses", "selesai"]).maybeSingle() : { data: null };
    if (!first) coffeeError(error);
    const row = first as { id: string; request_print?: string | null };
    if (row.request_print && row.request_print !== print) coffeeError({ message: "COFFEE_KEY_REUSED" });
    id = row.id;
  }
  const order = id ? await orderById(id) : null;
  if (!order) throw new ServiceError(404, "Pesanan tidak ditemukan. Muat ulang halaman.");
  return { order: toMeetingOrder(order) };
}
