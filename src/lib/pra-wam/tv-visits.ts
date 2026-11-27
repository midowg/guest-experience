/*
 * Who opens the TV addresses (27 Nov 2026, asked by the owner). The addresses are open, with no
 * sign-in, so what can be known is the device, never the person: what kind of device it is, its
 * browser, its screen, which address and which version of the board it opened, and when. One line
 * per device, address and day (migration 202612030002). The network address itself is not kept:
 * only a mark made from it, to tell devices apart and to say which ones share a network.
 */

/** Which board a device got: the board itself, the one for old TVs, or the list a phone gets. */
export type TvVisitVersion = "papan" | "lite" | "hp";
export const tvVisitVersionLabels: Record<TvVisitVersion, string> = { papan: "Papan biasa", lite: "Papan lite (TV lama)", hp: "Tampilan HP" };
export type TvDeviceKind = "tv" | "hp" | "tablet" | "komputer";
export const tvDeviceKindLabels: Record<TvDeviceKind, string> = { tv: "TV", hp: "HP", tablet: "Tablet", komputer: "Komputer" };
export type TvDevice = { kind: TvDeviceKind; name: string };

export type TvVisit = {
  id: string; address: string; version: TvVisitVersion; kind: TvDeviceKind; name: string;
  width: number | null; height: number | null; firstSeenAt: string; lastSeenAt: string;
  /** The day (WIB) the line is for. */
  day: string;
  /** A mark of the device and of its network: the same device or network gives the same mark. */
  device: string; net: string;
};

/** How many days Pantauan shows, how many are kept, and how often one device's line is written again. */
export const TV_VISIT_DAYS = 7;
export const TV_VISIT_KEEP_DAYS = 30;
export const TV_VISIT_EVERY_MS = 5 * 60_000;

const BOT = /bot\b|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime|monitor|curl\/|wget\/|python-|node-fetch|axios\/|vercel|facebookexternalhit|whatsapp/i;

function browserOf(ua: string): string {
  const major = (pattern: RegExp) => ua.match(pattern)?.[1] ?? "";
  if (/SamsungBrowser\//.test(ua)) return `Samsung Internet ${major(/SamsungBrowser\/(\d+)/)}`.trim();
  if (/Edg(e|A|iOS)?\//.test(ua)) return `Edge ${major(/Edg(?:e|A|iOS)?\/(\d+)/)}`.trim();
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Firefox\/|FxiOS\//.test(ua)) return `Firefox ${major(/(?:Firefox|FxiOS)\/(\d+)/)}`.trim();
  if (/Chrome\/|CriOS\//.test(ua)) return `Chrome ${major(/(?:Chrome|CriOS)\/(\d+)/)}`.trim();
  if (/Safari\//.test(ua)) return "Safari";
  return "";
}

/**
 * What a device is, from what its browser says of itself: a TV (with its make when it says one), a
 * phone, a tablet or a computer, and its browser. Null for a robot or a browser that says nothing,
 * which are not people looking at the board.
 */
export function tvDevice(userAgent: string | null | undefined): TvDevice | null {
  const ua = (userAgent ?? "").trim();
  if (!ua || BOT.test(ua)) return null;
  const browser = browserOf(ua);
  const named = (kind: TvDeviceKind, what: string): TvDevice => ({ kind, name: browser ? `${what} · ${browser}` : what });
  // A TV says so, or names the system only TVs run.
  // LG first: its browser also says "SmartTV", which is not a make.
  if (/Web0S|webOS|NetCast|LG ?Browser/i.test(ua)) return named("tv", "TV LG");
  if (/Tizen|SMART-TV|Samsung.*TV/i.test(ua)) return named("tv", "TV Samsung");
  if (/BRAVIA|Sony.*TV/i.test(ua)) return named("tv", "TV Sony");
  if (/AFT[A-Z]|Fire ?TV/i.test(ua)) return named("tv", "Fire TV");
  if (/VIDAA|Hisense/i.test(ua)) return named("tv", "TV Hisense");
  if (/Android ?TV|GoogleTV|Google TV|CrKey|HbbTV|SmartTV|\bTV\b|; ?TV;|Mi ?Box|MiTV|TCL|Philips/i.test(ua)) return named("tv", /Android/i.test(ua) ? "TV Android" : "TV");
  if (/iPhone|iPod/.test(ua)) return named("hp", "iPhone");
  if (/iPad/.test(ua)) return named("tablet", "iPad");
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? named("hp", "HP Android") : named("tablet", "Tablet Android");
  if (/Windows/.test(ua)) return named("komputer", "Komputer Windows");
  if (/Macintosh|Mac OS X/.test(ua)) return named("komputer", "Mac");
  if (/CrOS/.test(ua)) return named("komputer", "Chromebook");
  if (/Linux|X11/.test(ua)) return named("komputer", "Komputer Linux");
  return named("komputer", "Perangkat lain");
}

/** Whether a device is looking now: it asked within the last two minutes (a board asks every ten seconds, the lite one every item). */
export const visitIsOn = (visit: Pick<TvVisit, "lastSeenAt">, now: number) => now - Date.parse(visit.lastSeenAt) < 2 * 60_000;

export type TvVisitSummary = {
  /** Different devices today, and how many of each kind. */
  today: number; byKind: Record<TvDeviceKind, number>;
  /** Devices looking right now, and devices that got the board for old TVs today. */
  now: number; lite: number;
  /** Different devices per day, oldest first, for the last TV_VISIT_DAYS days. */
  days: { day: string; devices: number }[];
};

/** The day before or after a day (YYYY-MM-DD), by whole days. */
const shiftDay = (day: string, by: number) => new Date(Date.parse(`${day}T00:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10);

/** The numbers Pantauan shows: a device counts once a day, whatever addresses it opened. */
export function visitSummary(visits: readonly TvVisit[], today: string, now: number): TvVisitSummary {
  const ofDay = (day: string) => visits.filter(visit => visit.day === day);
  const devices = (rows: readonly TvVisit[]) => new Set(rows.map(row => row.device));
  const todays = ofDay(today);
  const seen = new Map<string, TvDeviceKind>();
  for (const row of todays) if (!seen.has(row.device)) seen.set(row.device, row.kind);
  const byKind: Record<TvDeviceKind, number> = { tv: 0, hp: 0, tablet: 0, komputer: 0 };
  for (const kind of seen.values()) byKind[kind] += 1;
  return {
    today: seen.size, byKind,
    now: devices(todays.filter(row => visitIsOn(row, now))).size,
    lite: devices(todays.filter(row => row.version === "lite")).size,
    days: Array.from({ length: TV_VISIT_DAYS }, (_, index) => shiftDay(today, index - (TV_VISIT_DAYS - 1))).map(day => ({ day, devices: devices(ofDay(day)).size })),
  };
}

/** "2 TV · 1 HP": the kinds that came, most watched first; "" when none. */
export function kindsLabel(byKind: Record<TvDeviceKind, number>): string {
  return (["tv", "hp", "tablet", "komputer"] as const).filter(kind => byKind[kind] > 0).map(kind => `${byKind[kind]} ${tvDeviceKindLabels[kind]}`).join(" · ");
}
