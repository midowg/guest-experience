import type { Ice, Sugar, Temperature } from "@/lib/coffee/menu";
import type { GaState, MeetingOrder } from "@/lib/coffee/types";
import { coffeeApi } from "@/lib/routes";
import { request } from "../api";

/*
 * What GA's tablet asks the server (the F0 APIs under /api/coffee/ga). The screens take this as a
 * prop, so the preview (/dev-preview/coffee/nyata/ga) and the tests run the real components on a
 * make-believe one. The guest menu book is given no API at all: leaving it asks the app, which
 * asks the server only whether the typed PIN GA is right.
 */

export type MeetingBody = {
  room: string;
  picId: string;
  guest?: string;
  guestCount?: number;
  /** "Tambah lagi": the first sending of the same meeting. */
  parentId?: string;
  items: { for: "tamu" | "tim"; personId?: string; /** tamu: the name the guest gave in the menu book. */ guestName?: string; slug: string; /** Left out when the audience is not asked it. */ temperature?: Temperature; sugar?: Sugar; ice?: Ice; qty: number }[];
  /** One per sending: the same key sent twice is one order. */
  key: string;
};
export type MeetingDone = { order: MeetingOrder; message: string };

export type GaApi = {
  state(): Promise<GaState>;
  /** One sending of a meeting order. 409 when the first sending can no longer be added to. */
  send(body: MeetingBody): Promise<MeetingDone>;
  /** Is this the PIN GA? Resolves when it is; refuses with the server's words otherwise (409 when no PIN is set). */
  checkPin(pin: string): Promise<void>;
};

export const gaClient: GaApi = {
  state: async () => (await request<GaState>(coffeeApi.gaState)).data,
  async send(body) {
    const result = await request<{ order: MeetingOrder }>(coffeeApi.gaMeetings, { method: "POST", body: JSON.stringify(body) });
    return { order: result.data.order, message: result.message };
  },
  async checkPin(pin) { await request(coffeeApi.gaPin, { method: "POST", body: JSON.stringify({ pin }) }); },
};
