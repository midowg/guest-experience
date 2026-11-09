import { z } from "zod";

/*
 * Notifikasi di HP (8 Nov 2026), the parts the browser and the server share: what a phone sends
 * when it turns notifications on, and what this browser can do. Web Push works on Android and
 * desktop browsers; on iPhone only from iOS 16.4 and only when WAM is opened from its home-screen
 * icon, not in Safari.
 */

export const pushSubscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.url().max(2000),
    keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  }),
  device: z.string().trim().max(120).default(""),
});
export const pushEndpointSchema = z.object({ endpoint: z.url().max(2000) });

/** What a notification carries to the phone: shown as is, and opened at `url` when tapped. */
export type PushPayload = { title: string; body: string; url: string; tag?: string };

/*
 * Which notifications reach the phone (8 Nov 2026), so it never turns into spam, leaders included.
 * Every notification stays in the bell (Notifikasi); only these topics may also push, each person
 * can switch them in Pengaturan (except Pengumuman), and the quiet ones wait for the bell at night.
 *   pengumuman       from panitia, to everyone it names: always pushed, cannot be switched off
 *   hod              Meeting HOD: invited, moved, rejected, cancelled, scheduled (needs an answer)
 *   forum            sessions panitia publish, move or cancel (forum, pleno, ...)
 *   booking_penting  a room booking you are in moved or cancelled, starting within 24 hours
 *   booking_baru     you were tagged in a new room booking: off by default, the bell only
 *   permintaan       the answer to your schedule change request
 *   kuesioner        the questionnaire reminder
 * A booking moved or cancelled more than 24 hours ahead is not pushed (topic null): the bell has it.
 */
export const PUSH_TOPICS = ["pengumuman", "hod", "forum", "booking_penting", "booking_baru", "permintaan", "kuesioner"] as const;
export type PushTopic = (typeof PUSH_TOPICS)[number];
/** `only: "hod"`: shown in Pengaturan only to a HOD (nobody else is ever invited to a Meeting HOD). */
export const pushTopicInfo: Record<PushTopic, { label: string; hint: string; on: boolean; locked?: boolean; quiet: boolean; only?: "hod" }> = {
  pengumuman: { label: "Pengumuman panitia", hint: "Selalu dikirim ke semua yang dituju", on: true, locked: true, quiet: false },
  hod: { label: "Meeting HOD", hint: "Undangan yang perlu dijawab, perubahan, dan pembatalan", on: true, quiet: false, only: "hod" },
  forum: { label: "Sesi dari panitia", hint: "Forum dan sesi baru, pindah jadwal, atau batal", on: true, quiet: true },
  booking_penting: { label: "Booking berubah mendadak", hint: "Booking yang kamu ikuti pindah atau batal kurang dari 24 jam sebelum mulai", on: true, quiet: false },
  booking_baru: { label: "Undangan booking baru", hint: "Setiap kali seseorang menandaimu di booking ruang", on: false, quiet: true },
  permintaan: { label: "Jawaban permintaan jadwal", hint: "Saat panitia menjawab permintaan ganti jadwalmu", on: true, quiet: true },
  kuesioner: { label: "Pengingat kuesioner", hint: "Pengingat dari HR sampai kuesioner selesai", on: true, quiet: true },
};
/** A person's own choices (topic → on/off); a topic not in it follows its default. */
export type PushPrefs = Partial<Record<PushTopic, boolean>>;
// Partial: a save may carry one topic (the switch that was flipped); unknown topics are refused.
export const pushPrefsSchema = z.object({ prefs: z.partialRecord(z.enum(PUSH_TOPICS), z.boolean()) }).strict();

/** Every topic with what applies for this person: their choice, else the default; a locked one is always on. */
export function resolvePrefs(prefs: PushPrefs | null | undefined): Record<PushTopic, boolean> {
  return Object.fromEntries(PUSH_TOPICS.map(topic => [topic, pushTopicInfo[topic].locked ? true : prefs?.[topic] ?? pushTopicInfo[topic].on])) as Record<PushTopic, boolean>;
}

/** Quiet hours, 21.00 to 06.00 WIB: the quiet topics are not pushed then (the bell still has them). */
export function inQuietHours(now: Date): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(now));
  return hour >= 21 || hour < 6;
}

/** Whether a notification of this topic goes to this person's phone now. A null topic never does. */
export function shouldPush(topic: PushTopic | null, prefs: PushPrefs | null | undefined, now: Date): boolean {
  if (!topic) return false;
  if (!resolvePrefs(prefs)[topic]) return false;
  return !(pushTopicInfo[topic].quiet && inQuietHours(now));
}

/** A room booking's change as a topic: new is booking_baru; moved or cancelled within 24 hours is booking_penting; later, none. */
export function bookingTopic(change: "terbit" | "berubah" | "batal", startsAt: string, now: Date): PushTopic | null {
  if (change === "terbit") return "booking_baru";
  return Date.parse(startsAt) - now.getTime() <= 24 * 60 * 60 * 1000 ? "booking_penting" : null;
}

/** The VAPID public key (base64url) as the bytes PushManager.subscribe wants. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export type PushSupport = "ok" | "ios-install" | "unsupported";

/** Whether this browser can take notifications; an iPhone in Safari must open WAM from its icon first. */
export function pushSupport(env: { userAgent: string; standalone: boolean; hasPush: boolean }): PushSupport {
  const ios = /iPhone|iPad|iPod/.test(env.userAgent);
  if (ios && !env.standalone) return "ios-install";
  return env.hasPush ? "ok" : "unsupported";
}

/** A short name for the device in the list of phones ("Android · Chrome"), never more than the browser says. */
export function deviceLabel(userAgent: string): string {
  const os = /iPhone|iPad|iPod/.test(userAgent) ? "iPhone" : /Android/.test(userAgent) ? "Android" : /Windows/.test(userAgent) ? "Windows" : /Mac OS X/.test(userAgent) ? "Mac" : "Perangkat";
  const browser = /EdgA?\//.test(userAgent) ? "Edge" : /SamsungBrowser/.test(userAgent) ? "Samsung Internet" : /Firefox|FxiOS/.test(userAgent) ? "Firefox" : /Chrome|CriOS/.test(userAgent) ? "Chrome" : /Safari/.test(userAgent) ? "Safari" : "";
  return browser ? `${os} · ${browser}` : os;
}
