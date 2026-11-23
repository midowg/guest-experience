import type { CarbonEventSettings, CarbonPerson, CarbonTravel } from "./carbon";

/*
 * Made-up people for the Jejak karbon previews and prototype (no real names, rooms or trips): five
 * rooms of one to three, some rows still empty so the admin page shows what is missing.
 */
export const SAMPLE_CARBON_SETTINGS: CarbonEventSettings = { nights: 2, mealsPerPerson: 6, shuttleKm: 27, shuttlePerBus: 30, groupBusPerBus: 40 };

const train = (from: string, km: number): CarbonTravel => ({ from, mode: "kereta", km, roundTrip: true, shuttle: true });
const bus = (from: string, km: number): CarbonTravel => ({ from, mode: "bus", km, roundTrip: true, shuttle: false });

export const SAMPLE_CARBON_PEOPLE: CarbonPerson[] = [
  { id: "p1", name: "Rani Contoh", dept: "Departemen Contoh", room: "A3", occupants: 3, travel: train("Jakarta", 513) },
  { id: "p2", name: "Bima Contoh", dept: "Departemen Lain", room: "A3", occupants: 3, travel: train("Jakarta", 513) },
  { id: "p3", name: "Citra Contoh", dept: "Departemen Contoh", room: "A3", occupants: 3, travel: null },
  { id: "p4", name: "Dimas Contoh", dept: "Departemen Tiga", room: "B1", occupants: 2, travel: train("Bandung", 380) },
  { id: "p5", name: "Eko Contoh", dept: "Departemen Lain", room: "B1", occupants: 2, travel: bus("Semarang", 120) },
  { id: "p6", name: "Fajar Contoh", dept: "Departemen Tiga", room: "B2", occupants: 1, travel: { from: "Yogyakarta", mode: "lainnya", km: 0, roundTrip: true, shuttle: false } },
  { id: "p7", name: "Gita Contoh", dept: "Departemen Empat", room: "A1", occupants: 3, travel: train("Surabaya", 327) },
  { id: "p8", name: "Hana Contoh", dept: "Departemen Empat", room: "A1", occupants: 3, travel: { from: "Surabaya", mode: "kereta", km: 0, roundTrip: true, shuttle: true } },
  { id: "p9", name: "Indah Contoh", dept: "Departemen Contoh", room: "A1", occupants: 3, travel: bus("Solo", 60) },
  { id: "p10", name: "Joko Contoh", dept: "Departemen Lima", room: "B3", occupants: 2, travel: train("Jakarta", 513) },
  { id: "p11", name: "Kiki Contoh", dept: "Departemen Lima", room: "B3", occupants: 2, travel: null },
  { id: "p12", name: "Lina Contoh", dept: "Departemen Tiga", room: "A2", occupants: 1, travel: train("Malang", 350) },
];
