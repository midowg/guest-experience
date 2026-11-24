import "server-only";
import { carbonPageView, personalCarbonDataFrom, personalCarbonEstimate, type CarbonPageView } from "@/lib/main-wam/peserta/carbon-saya";
import type { MainWamContext } from "../gate";
import { demoOn, demoPlaceFor } from "../demo";
import { readLang } from "../lang";
import { gatherCarbon, seatsPerTrip } from "../panitia/carbon";
import { viewerRoom } from "../viewer";

/*
 * Jejak karbon for the person (E01 and the Beranda card): their OWN footprint (their seats, the
 * room they sleep in and share, the meals) and the whole event's, from what Admin WAM already holds
 * (panitia/carbon.ts, nobody fills a form), said in the person's language. Only the person's own
 * numbers and the totals leave here: no other person's name or seat. It never throws: a failed read
 * or nothing to count yet is "belum", and the screens say so kindly.
 */

export async function loadCarbon({ settings, viewer }: Pick<MainWamContext, "settings" | "viewer">, now: Date): Promise<CarbonPageView> {
  const lang = await readLang();
  try {
    const gathered = await gatherCarbon(settings);
    const overall = gathered.result.empty ? null : gathered.result;
    // The room: HR's pairing once published; in demo mode the sample room stands in while it is not there.
    const room = viewer.room ?? await viewerRoom(viewer.id).catch(() => null) ?? ((await demoOn()) ? demoPlaceFor(viewer).room : null);
    const mine = overall ? personalCarbonEstimate(personalCarbonDataFrom({
      people: gathered.people, nights: gathered.nights, roomOccupants: room?.people.length ?? 0, trips: gathered.trips,
      seatCount: seatsPerTrip(gathered.seats), mySeats: new Set(gathered.seats.filter(seat => seat.employeeId === viewer.id).map(seat => seat.tripId)),
      sessions: gathered.sessions, overall,
    })) : null;
    return carbonPageView(mine, overall, now, lang);
  } catch { return carbonPageView(null, null, now, lang); }
}
