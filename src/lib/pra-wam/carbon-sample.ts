import type { CarbonPerson, CarbonRoute, CarbonSetup, CarbonTravel } from "./carbon";

/*
 * Made-up people for the Jejak karbon previews and prototype (no real names, rooms or trips): six
 * routes the panitia listed, twelve people in six rooms, three of them still without an answer.
 */
export const SAMPLE_CARBON_ROUTES: CarbonRoute[] = [
  { id: "r1", from: "Jakarta", mode: "kereta", km: 513 },
  { id: "r2", from: "Bandung", mode: "kereta", km: 380 },
  { id: "r3", from: "Surabaya", mode: "kereta", km: 327 },
  { id: "r4", from: "Malang", mode: "kereta", km: 350 },
  { id: "r5", from: "Semarang", mode: "bus", km: 120 },
  { id: "r6", from: "Solo", mode: "bus", km: 60 },
];

export const SAMPLE_CARBON_SETUP: CarbonSetup = {
  settings: { nights: 2, mealsPerPerson: 6, shuttleKm: 27, shuttlePerBus: 30, groupBusPerBus: 40 },
  routes: SAMPLE_CARBON_ROUTES,
  formOpen: true,
};

const answer = (routeId: string, shuttle = true): CarbonTravel => ({ routeId, roundTrip: true, shuttle, answeredAt: "2026-11-23T03:15:00Z" });

export const SAMPLE_CARBON_PEOPLE: CarbonPerson[] = [
  { id: "p1", name: "Rani Contoh", dept: "Departemen Contoh", room: "A3", occupants: 3, travel: null },
  { id: "p2", name: "Bima Contoh", dept: "Departemen Lain", room: "A3", occupants: 3, travel: answer("r1") },
  { id: "p3", name: "Citra Contoh", dept: "Departemen Contoh", room: "A3", occupants: 3, travel: null },
  { id: "p4", name: "Dimas Contoh", dept: "Departemen Tiga", room: "B1", occupants: 2, travel: answer("r2") },
  { id: "p5", name: "Eko Contoh", dept: "Departemen Lain", room: "B1", occupants: 2, travel: answer("r5", false) },
  { id: "p6", name: "Fajar Contoh", dept: "Departemen Tiga", room: "B2", occupants: 1, travel: answer("lain", false) },
  { id: "p7", name: "Gita Contoh", dept: "Departemen Empat", room: "A1", occupants: 3, travel: answer("r3") },
  { id: "p8", name: "Hana Contoh", dept: "Departemen Empat", room: "A1", occupants: 3, travel: answer("r3") },
  { id: "p9", name: "Indah Contoh", dept: "Departemen Contoh", room: "A1", occupants: 3, travel: answer("r6", false) },
  { id: "p10", name: "Joko Contoh", dept: "Departemen Lima", room: "B3", occupants: 2, travel: answer("r1") },
  { id: "p11", name: "Kiki Contoh", dept: "Departemen Lima", room: "B3", occupants: 2, travel: null },
  { id: "p12", name: "Lina Contoh", dept: "Departemen Tiga", room: "A2", occupants: 1, travel: answer("r4") },
];
