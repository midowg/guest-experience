import { shortDate } from "@/lib/main-wam/admin/labels";
import { wibDate, wibTime } from "@/lib/main-wam/rundown";
import type { MainWamEventInfo } from "@/lib/main-wam/types";

/** "Sen, 4 Jan · 15.30" of a check-in or check-out (empty when not set). */
export const stayMoment = (iso: string | null) => (iso ? `${shortDate(wibDate(iso))} · ${wibTime(iso).replace(":", ".")}` : "");

/** The hotel line Kamar shows above its rooms. */
export const stayLine = (event: Pick<MainWamEventInfo, "hotel" | "checkInAt" | "checkOutAt">) => ({ hotel: event.hotel, checkIn: stayMoment(event.checkInAt), checkOut: stayMoment(event.checkOutAt) });
