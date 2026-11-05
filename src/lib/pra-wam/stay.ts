/*
 * Room pairing for the WAM stay (migration 202611050001), the parts that need no database: what a
 * person's stay answers say, how well two people would share a room, what HR should look at in a
 * room, and an automatic suggestion that HR then adjusts by hand. Pure, so it can be tested.
 *
 * Hard rules: the same "untuk pembagian kamar" answer (question 33) in a room, and a smoker never
 * with someone who minds smoke. Everything else only moves the score: roommates someone named
 * (question 13, both ways counts more), bed and wake times (7, 8), AC (10), the department wish
 * (12) and sleep habits that clash (9).
 */

export const STAY_MIGRATION = "202611050001_wam_stay_rooms.sql";

/** The stay questions by their fixed key. */
export const STAY_KEYS = { gender: "33", sleep: "7", wake: "8", habits: "9", ac: "10", smoke: "11", department: "12", wants: "13" } as const;

const SLEEP = ["Sebelum 22.00", "22.00–24.00", "Lewat tengah malam"];
const WAKE = ["Sebelum 05.00", "05.00–06.30", "Setelah 06.30"];
const AC = ["Dingin sekali", "Sedang", "Tidak terlalu dingin"];
export const SMOKER = "Saya merokok";
export const MINDS_SMOKE = "Tidak merokok, keberatan";
const SAME_DEPARTMENT = "Lebih nyaman satu departemen";
const OTHER_DEPARTMENT = "Beda departemen, biar kenal";

export type StayPerson = {
  id: string; name: string; department: string;
  /** Question 33 as answered ("Laki-laki" or "Perempuan"); null when not answered yet. */
  gender: string | null;
  sleep: string | null; wake: string | null; ac: string | null; smoke: string | null; departmentWish: string | null;
  habits: string[];
  /** Roommates this person named (employee ids). */
  wants: string[];
};

type Value = string | string[] | boolean | Record<string, string> | undefined;
const one = (value: Value) => (typeof value === "string" && value ? value : null);
const many = (value: Value) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

/** A person's stay answers, by question key, as a StayPerson. */
export function stayPerson(person: { id: string; name: string; department: string }, answers: Record<string, Value>): StayPerson {
  return {
    ...person,
    gender: one(answers[STAY_KEYS.gender]),
    sleep: one(answers[STAY_KEYS.sleep]), wake: one(answers[STAY_KEYS.wake]), ac: one(answers[STAY_KEYS.ac]),
    smoke: one(answers[STAY_KEYS.smoke]), departmentWish: one(answers[STAY_KEYS.department]),
    habits: many(answers[STAY_KEYS.habits]).filter(habit => habit !== "Tidak ada" && habit !== "Tidak ingin menjawab"),
    wants: many(answers[STAY_KEYS.wants]),
  };
}

const first = (person: StayPerson) => person.name.split(" ")[0];
const step = (list: string[], value: string | null) => (value ? list.indexOf(value) : -1);

/** Why two people may not share a room, in plain words, or null. */
export function blocked(a: StayPerson, b: StayPerson): string | null {
  if (a.gender && b.gender && a.gender !== b.gender) return `${first(a)} dan ${first(b)} berbeda isian pembagian kamar (${a.gender} dan ${b.gender}).`;
  for (const [smoker, other] of [[a, b], [b, a]]) {
    if (smoker.smoke === SMOKER && other.smoke === MINDS_SMOKE) return `${first(smoker)} merokok, ${first(other)} keberatan dengan rokok.`;
  }
  return null;
}

/** How well two people would share a room (higher is better), and what HR should look at. */
export function pairScore(a: StayPerson, b: StayPerson): { score: number; notes: string[] } {
  const notes: string[] = [];
  let score = 0;
  const reason = blocked(a, b);
  if (reason) return { score: -100, notes: [reason] };

  const aWants = a.wants.includes(b.id), bWants = b.wants.includes(a.id);
  score += (aWants ? 6 : 0) + (bWants ? 6 : 0) + (aWants && bWants ? 4 : 0);

  const far = (list: string[], x: string | null, y: string | null) => {
    const i = step(list, x), j = step(list, y);
    return i < 0 || j < 0 ? 0 : Math.abs(i - j);
  };
  const sleepGap = far(SLEEP, a.sleep, b.sleep);
  if (sleepGap === 2) { score -= 4; notes.push(`Jam tidur jauh berbeda: ${first(a)} ${a.sleep}, ${first(b)} ${b.sleep}.`); } else score -= sleepGap;
  const wakeGap = far(WAKE, a.wake, b.wake);
  if (wakeGap === 2) { score -= 3; notes.push(`Jam bangun jauh berbeda: ${first(a)} ${a.wake}, ${first(b)} ${b.wake}.`); } else score -= wakeGap;
  const acGap = far(AC, a.ac, b.ac);
  if (acGap === 2) { score -= 4; notes.push(`AC: ${first(a)} ${a.ac?.toLowerCase()}, ${first(b)} ${b.ac?.toLowerCase()}.`); } else score -= acGap;

  if (a.smoke === SMOKER && b.smoke === SMOKER) score += 1;

  for (const [person, other] of [[a, b], [b, a]]) {
    const same = !!person.department && person.department === other.department;
    if (person.departmentWish === SAME_DEPARTMENT) score += same ? 2 : -1;
    if (person.departmentWish === OTHER_DEPARTMENT) score += same ? -1 : 2;
  }

  for (const [x, y] of [[a, b], [b, a]]) {
    if (x.habits.includes("Mendengkur") && y.habits.includes("Gampang terbangun")) { score -= 4; notes.push(`${first(x)} mendengkur, ${first(y)} gampang terbangun.`); }
    if (x.habits.includes("Butuh kamar gelap total") && y.habits.includes("Nyaman dengan lampu menyala")) { score -= 2; notes.push(`${first(x)} butuh kamar gelap, ${first(y)} nyaman dengan lampu menyala.`); }
    if (x.habits.includes("Sering ke kamar mandi malam") && y.habits.includes("Gampang terbangun")) score -= 1;
  }
  return { score, notes };
}

/** What HR should look at in a room: blocks first, then clashes, then who is missing a stay answer. */
export function roomNotes(people: StayPerson[]): { blocked: string[]; notes: string[] } {
  const hard: string[] = [], soft: string[] = [];
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const reason = blocked(people[i], people[j]);
      if (reason) hard.push(reason); else soft.push(...pairScore(people[i], people[j]).notes);
    }
  }
  const unanswered = people.filter(person => !person.gender).map(first);
  if (unanswered.length) soft.push(`${unanswered.join(", ")} belum mengisi bagian menginap.`);
  return { blocked: hard, notes: soft };
}

export type SuggestRoom = { id: string; name: string; capacity: number; members: string[] };

/**
 * Fills the free beds with people who have no room yet, keeping everyone already placed. Rooms
 * that already have people fill first (with the same group), then empty rooms, largest first. An
 * empty room starts with whoever named the most roommates still free, then takes, bed by bed, the
 * free person who fits best with everyone in it. Nobody is placed against a hard rule, and nobody
 * without a stay answer. Deterministic: the same answers give the same suggestion.
 */
export function suggestRooms(people: StayPerson[], rooms: SuggestRoom[]): { employeeId: string; roomId: string }[] {
  const byId = new Map(people.map(person => [person.id, person]));
  const placed = new Set(rooms.flatMap(room => room.members));
  const free = people.filter(person => person.gender && !placed.has(person.id)).sort((a, b) => a.name.localeCompare(b.name, "id") || a.id.localeCompare(b.id));
  const order = [...rooms].sort((a, b) => (b.members.length > 0 ? 1 : 0) - (a.members.length > 0 ? 1 : 0) || b.capacity - a.capacity || a.name.localeCompare(b.name, "id", { numeric: true }));
  const result: { employeeId: string; roomId: string }[] = [];
  const take = (person: StayPerson) => { free.splice(free.indexOf(person), 1); };
  const fits = (person: StayPerson, members: StayPerson[]) => members.every(member => !blocked(person, member));
  const total = (person: StayPerson, members: StayPerson[]) => members.reduce((sum, member) => sum + pairScore(person, member).score, 0);

  for (const room of order) {
    const members = room.members.map(id => byId.get(id)).filter((person): person is StayPerson => !!person);
    // A room holding someone without a stay answer has no known group; leave it to HR.
    if (room.members.length !== members.length || members.some(member => !member.gender)) continue;
    let left = room.capacity - room.members.length;
    while (left > 0 && free.length) {
      let next: StayPerson | undefined;
      if (!members.length) {
        const wishes = (person: StayPerson) => free.filter(other => other !== person && !blocked(person, other) && (person.wants.includes(other.id) || other.wants.includes(person.id))).length;
        next = [...free].sort((a, b) => wishes(b) - wishes(a))[0];
      } else {
        const candidates = free.filter(person => fits(person, members));
        next = candidates.sort((a, b) => total(b, members) - total(a, members))[0];
      }
      if (!next) break;
      take(next);
      members.push(next);
      result.push({ employeeId: next.id, roomId: room.id });
      left--;
    }
  }
  return result;
}

/* ---- The hotel's rooms, pasted one per line ---------------------------------------------------- */

export const ROOM_LIMITS = { name: 40, kind: 40, capacity: 8, perPaste: 300 } as const;
export type RoomLine = { name: string; kind: string; capacity: number };

/**
 * "208, Twin bed, 2" per line (comma, semicolon or tab); the kind may be left out ("208, 2"). A
 * range "201-210, Twin bed, 2" adds every number in it. Returns the rooms, or the lines that could
 * not be read, by line number.
 */
export function parseRoomLines(text: string): { rooms: RoomLine[]; problems: string[] } {
  const rooms: RoomLine[] = [], problems: string[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/[,;\t]/).map(part => part.trim()).filter(Boolean);
    const where = `Baris ${index + 1}`;
    if (parts.length < 2 || parts.length > 3) { problems.push(`${where}: tulis "nomor, jenis, kapasitas", misalnya "208, Twin bed, 2".`); return; }
    const capacity = Number(parts[parts.length - 1]);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > ROOM_LIMITS.capacity) { problems.push(`${where}: kapasitas harus angka 1–${ROOM_LIMITS.capacity}.`); return; }
    const kind = parts.length === 3 ? parts[1] : "";
    if (kind.length > ROOM_LIMITS.kind) { problems.push(`${where}: jenis kamar paling panjang ${ROOM_LIMITS.kind} karakter.`); return; }
    const range = parts[0].match(/^(\d{1,5})\s*[-–]\s*(\d{1,5})$/);
    const names = range ? Array.from({ length: Math.max(0, Number(range[2]) - Number(range[1]) + 1) }, (_, at) => String(Number(range[1]) + at)) : [parts[0]];
    if (range && (names.length === 0 || names.length > 100)) { problems.push(`${where}: rentang nomor kamar tidak terbaca (paling banyak 100 kamar per baris).`); return; }
    for (const name of names) {
      if (name.length > ROOM_LIMITS.name) { problems.push(`${where}: nama kamar paling panjang ${ROOM_LIMITS.name} karakter.`); return; }
      rooms.push({ name, kind, capacity });
    }
  });
  const seen = new Set<string>();
  for (const room of rooms) {
    const key = room.name.toLowerCase();
    if (seen.has(key)) problems.push(`Kamar ${room.name} tertulis lebih dari sekali.`);
    seen.add(key);
  }
  if (rooms.length > ROOM_LIMITS.perPaste) problems.push(`Paling banyak ${ROOM_LIMITS.perPaste} kamar sekali tambah.`);
  return { rooms, problems };
}
