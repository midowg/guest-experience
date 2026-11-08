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
