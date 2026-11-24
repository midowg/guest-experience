import "server-only";
import {
  carbonFormOpen, carbonPageView, personalCarbonDataFrom, personalCarbonEstimate, type CarbonPageModel, type CarbonPageView,
} from "@/lib/main-wam/peserta/carbon-saya";
import { carbonAnswerInputSchema, type CarbonTravel } from "@/lib/pra-wam/carbon";
import { ServiceError } from "../../config";
import type { MainWamContext } from "../gate";
import { demoOn, demoPlaceFor } from "../demo";
import { readLang } from "../lang";
import { gatherCarbon, seatsPerTrip } from "../panitia/carbon";
import { limitPerPerson } from "../panitia/common";
import { viewerRoom } from "../viewer";
import { readCarbonAnswer, writeCarbonAnswer } from "./carbon-answer";

/*
 * Jejak karbon for the person (E01 and the Beranda card): their OWN footprint (their seats, the
 * room they sleep in and share, the meals, and what they told in the calculator like in Pra WAM) and the whole
 * event's, from what Admin WAM already holds (panitia/carbon.ts) and the person's own saved answer
 * (carbon-answer.ts), said in the person's language. Only the person's own numbers and the totals leave
 * here: no other person's name, seat or answer. It never throws: a failed read or nothing to count yet is "belum".
 */

/** What the page recounts from (numbers only), or null data when there is nothing to count yet. */
export async function loadCarbonModel({ settings, viewer }: Pick<MainWamContext, "settings" | "viewer">, now: Date): Promise<CarbonPageModel> {
  const open = carbonFormOpen(settings.event.endDate, now);
  const empty: CarbonPageModel = { data: null, answer: null, overall: null, open, storage: "ok", now: now.toISOString() };
  try {
    const [gathered, stored] = await Promise.all([gatherCarbon(settings), readCarbonAnswer(viewer.id)]);
    const overall = gathered.result.empty ? null : gathered.result;
    // The room: HR's pairing once published; in demo mode the sample room stands in while it is not there.
    const room = viewer.room ?? await viewerRoom(viewer.id).catch(() => null) ?? ((await demoOn()) ? demoPlaceFor(viewer).room : null);
    const data = overall ? personalCarbonDataFrom({
      people: gathered.people, nights: gathered.nights, roomOccupants: room?.people.length ?? 0, trips: gathered.trips,
      seatCount: seatsPerTrip(gathered.seats), mySeats: new Set(gathered.seats.filter(seat => seat.employeeId === viewer.id).map(seat => seat.tripId)),
      sessions: gathered.sessions, overall,
    }) : null;
    return { data, answer: stored.answer, overall, open, storage: stored.storage, now: now.toISOString() };
  } catch { return empty; }
}

/** The person's own view and the event's, with their saved answer counted in (Beranda's card, the page's first paint). */
export async function loadCarbon(context: Pick<MainWamContext, "settings" | "viewer">, now: Date): Promise<CarbonPageView> {
  const lang = await readLang();
  const model = await loadCarbonModel(context, now);
  return carbonPageView(model.data ? personalCarbonEstimate(model.data, model.answer) : null, model.overall, now, lang);
}

/**
 * Keeps the person's answer: while answers are taken and the table is there. The answer is checked against
 * Pra WAM's own schema (carbonAnswerInputSchema: the same limits, so the same answer is valid in both).
 */
export async function saveMyCarbon(context: MainWamContext, input: unknown, now: Date): Promise<CarbonTravel> {
  const parsed = carbonAnswerInputSchema.safeParse(input);
  if (!parsed.success) throw new ServiceError(400, parsed.error.issues[0]?.message ?? "Isian belum benar.");
  if (!carbonFormOpen(context.settings.event.endDate, now)) throw new ServiceError(409, "Pengisian sudah ditutup.");
  await limitPerPerson("karbon", context.viewer.id, 40);
  return writeCarbonAnswer(context.viewer.id, parsed.data, now);
}
