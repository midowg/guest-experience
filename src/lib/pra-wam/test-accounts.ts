import { z } from "zod";
import type { MissionView } from "./mission";

/*
 * Akun uji (Admin Pra WAM, 24 Nov 2026): accounts that may try Misi Perjalanan as a HoD and Jejak
 * karbon before the event, taken back by removing them from the list. A test account gets a made-up
 * room (the people below are not real), so no one's real room, names or answers are shown. One row
 * of pw_settings; no migration.
 */
export const TEST_ACCOUNTS_KEY = "akun_uji";
export const TEST_ACCOUNTS_MAX = 10;

export type TestAccounts = {
  ids: string[];
  /** While on, Jejak karbon shows only to the test accounts; off, to everyone listed as usual. */
  carbonTestOnly: boolean;
};
export const NO_TEST_ACCOUNTS: TestAccounts = { ids: [], carbonTestOnly: false };

export const testAccountsSchema = z.object({
  ids: z.array(z.string().uuid("Akun tidak dikenal.")).max(TEST_ACCOUNTS_MAX, `Paling banyak ${TEST_ACCOUNTS_MAX} akun uji.`),
  carbonTestOnly: z.boolean(),
});

/** The stored list, or none when there is no row or it cannot be read. */
export function asTestAccounts(value: unknown): TestAccounts {
  const parsed = testAccountsSchema.safeParse(value);
  return parsed.success ? { ids: [...new Set(parsed.data.ids)], carbonTestOnly: parsed.data.carbonTestOnly } : NO_TEST_ACCOUNTS;
}

const choice = (name: string) => ({ id: name.toUpperCase(), name, nick: name.split(" ")[1] ?? "" });
const mate = (name: string, nick: string, dept: string, decoys: string[]) => ({
  name, nick, dept, sleep: "22.00–24.00", wake: "05.00–06.30",
  hints: [`Petunjuk pertama tentang ${nick} (contoh).`, `Petunjuk kedua tentang ${nick} (contoh).`, `Petunjuk ketiga tentang ${nick} (contoh).`],
  // A question per hint, the other names changing (as the server makes them).
  questions: [[decoys[0], name, decoys[1]], [name, decoys[1], decoys[2]], [decoys[2], decoys[0], name]].map(names => ({ choices: names.map(choice) })),
});

/** The made-up room of a test account: two "Contoh" roommates, so three in the room. */
export const TEST_ROOM: NonNullable<MissionView["room"]> = {
  code: "UJI",
  mates: [mate("Contoh Satu", "Satu", "Departemen Contoh", ["Contoh Tiga", "Contoh Empat", "Contoh Lima"]), mate("Contoh Dua", "Dua", "Departemen Lain", ["Contoh Enam", "Contoh Tiga", "Contoh Empat"])],
  self: { sleep: "Sebelum 22.00", wake: "Sebelum 05.00" },
};
export const TEST_OCCUPANTS = TEST_ROOM.mates.length + 1;
/** Two sentences of Susun Kalimatmu, as a HoD holding two would get. */
export const TEST_SENTENCES = [6, 12];

/** What a test account receives in Misi Perjalanan: a HoD with the made-up room. */
export function testMissionView(member: { id: string; name: string; nickname?: string | null }): MissionView {
  return { employeeId: member.id, name: member.name, nick: member.nickname || member.name.split(" ")[0], role: "HoD", ceo: false, sentences: TEST_SENTENCES, room: TEST_ROOM, testing: true };
}
