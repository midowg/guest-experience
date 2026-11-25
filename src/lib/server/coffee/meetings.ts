import "server-only";
import { dayStart, wibDay } from "@/lib/coffee/quota";
import { ROOMS, roomSpot } from "@/lib/coffee/rooms";
import type { MeetingInput } from "@/lib/coffee/schemas";
import type { GaState, MeetingOrder } from "@/lib/coffee/types";
import { ServiceError } from "../config";
import type { Member } from "../pra-wam/session";
import { activePeople } from "./people";
import { ORDER_COLUMNS, coffeeError, db, orderById, toMeetingOrder, toOrder, type OrderRow } from "./store";

/*
 * Mode GA (/coffee/ga): meeting orders for guests and the team in the room. No quota: a guest's
 * drink is recorded under the PIC, a team member's under that person. The tablet is shared, so it
 * shows every meeting order of today, whoever sent it.
 */

export async function gaState(_member: Member, now = new Date()): Promise<GaState> {
  const [found, people] = await Promise.all([
    db().from("coffee_orders").select(ORDER_COLUMNS).eq("kind", "rapat").gte("ordered_at", dayStart(wibDay(now.toISOString()))).order("ordered_at", { ascending: false }).limit(300),
    activePeople(),
  ]);
  if (found.error) coffeeError(found.error);
  return {
    today: ((found.data ?? []) as unknown as OrderRow[]).map(row => toMeetingOrder(toOrder(row))),
    people: people.map(({ id, name, position, bu }) => ({ id, name, position, bu })),
    rooms: ROOMS.map(room => ({ ...room })),
  };
}

/** One sending of a meeting order; with `parentId` ("Tambah lagi") it is the next round of the same meeting. */
export async function submitMeeting(member: Member, input: MeetingInput, now = new Date()): Promise<{ order: MeetingOrder }> {
  const { data, error } = await db().rpc("coffee_submit_meeting", {
    p_order: {
      pic_id: input.picId, room: input.room, room_spot: roomSpot(input.room), guest: input.guest ?? null, guest_count: input.guestCount ?? null,
      parent_id: input.parentId ?? null, actor_id: member.id, actor_label: (member.nickname || member.name).slice(0, 120), ordered_at: now.toISOString(), manual: false,
    },
    p_items: input.items.map(item => ({ for: item.for, person_id: item.personId ?? null, slug: item.slug, temperature: item.temperature, sugar: item.sugar, ice: item.ice, qty: item.qty })),
    p_key: input.key,
  });
  let id = data as string | null;
  if (error) {
    // Two sendings of the same key met at the unique index: the first one is the order.
    const { data: first } = error.code === "23505" ? await db().from("coffee_orders").select("id").eq("idempotency_key", input.key).maybeSingle() : { data: null };
    if (!first) coffeeError(error);
    id = (first as { id: string }).id;
  }
  const order = id ? await orderById(id) : null;
  if (!order) throw new ServiceError(404, "Pesanan tidak ditemukan. Muat ulang halaman.");
  return { order: toMeetingOrder(order) };
}
