import type { CarbonPerson, CarbonSetup, CarbonTravel, OwnMode } from "./carbon";

/*
 * Made-up data for the Jejak karbon previews (no real names or rooms). The trip's km and people per
 * vehicle are example values for the layout: the panitia type the real ones.
 */
export const SAMPLE_CARBON_SETUP: CarbonSetup = {
  settings: { nights: 2, mealsPerPerson: 6 },
  trip: { from: "Kantor Yogyakarta", to: "Kaliurang", mode: "mobil", km: 25, perVehicle: 6, roundTrip: true },
  formOpen: true,
};

const own = (from: string, mode: OwnMode, km: number): CarbonTravel => ({ own: { from, mode, km, roundTrip: true }, bottles: 2, laptopHours: 6, phoneCharges: 2, answeredAt: "2026-11-23T03:15:00Z" });

export const SAMPLE_CARBON_PEOPLE: CarbonPerson[] = [
  { id: "p1", name: "Rani Contoh", dept: "Departemen Contoh", room: "A3", occupants: 3, travel: null },
  { id: "p2", name: "Bima Contoh", dept: "Departemen Lain", room: "A3", occupants: 3, travel: null },
  { id: "p3", name: "Citra Contoh", dept: "Departemen Contoh", room: "A3", occupants: 3, travel: null },
  { id: "p4", name: "Dimas Contoh", dept: "Departemen Tiga", room: "B1", occupants: 2, travel: own("Magelang", "mobil", 45) },
  { id: "p5", name: "Eko Contoh", dept: "Departemen Lain", room: "B1", occupants: 2, travel: null },
  { id: "p6", name: "Fajar Contoh", dept: "Departemen Tiga", room: "B2", occupants: 1, travel: own("Sleman", "motor", 15) },
  { id: "p7", name: "Gita Contoh", dept: "Departemen Empat", room: "A1", occupants: 3, travel: null },
  { id: "p8", name: "Hana Contoh", dept: "Departemen Empat", room: "A1", occupants: 3, travel: null },
  { id: "p9", name: "Indah Contoh", dept: "Departemen Contoh", room: "A1", occupants: 3, travel: null },
  { id: "p10", name: "Joko Contoh", dept: "Departemen Lima", room: "B3", occupants: 2, travel: null },
  { id: "p11", name: "Kiki Contoh", dept: "Departemen Lima", room: "B3", occupants: 2, travel: null },
  { id: "p12", name: "Lina Contoh", dept: "Departemen Tiga", room: "A2", occupants: 1, travel: null },
];
