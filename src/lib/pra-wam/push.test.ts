import { describe, expect, it } from "vitest";
import { bookingTopic, deviceLabel, inQuietHours, keyBytes, PUSH_TOPICS, pushPrefsSchema, pushSubscriptionSchema, pushSupport, pushTopicInfo, resolvePrefs, shouldPush } from "./push";

describe("which notifications reach the phone", () => {
  // 10.00 WIB and 22.00 WIB (= 15.00Z) on 9 Nov 2026.
  const day = new Date("2026-11-09T03:00:00Z");
  const night = new Date("2026-11-09T15:00:00Z");

  it("describes every topic", () => {
    expect(Object.keys(pushTopicInfo).sort()).toEqual([...PUSH_TOPICS].sort());
  });

  it("follows the defaults, the person's choices, and keeps Pengumuman on", () => {
    expect(resolvePrefs(null)).toEqual({ pengumuman: true, hod: true, forum: true, booking_penting: true, booking_baru: false, permintaan: true, kuesioner: true });
    expect(resolvePrefs({ forum: false, booking_baru: true, pengumuman: false })).toMatchObject({ forum: false, booking_baru: true, pengumuman: true, hod: true });
  });

  it("has quiet hours from 21.00 to 06.00 WIB", () => {
    expect(inQuietHours(new Date("2026-11-09T13:59:00Z"))).toBe(false); // 20.59
    expect(inQuietHours(new Date("2026-11-09T14:00:00Z"))).toBe(true); // 21.00
    expect(inQuietHours(new Date("2026-11-09T22:59:00Z"))).toBe(true); // 05.59
    expect(inQuietHours(new Date("2026-11-09T23:00:00Z"))).toBe(false); // 06.00
  });

  it("pushes a quiet topic by day only, an urgent one at any hour, and never a null topic", () => {
    expect(shouldPush("forum", null, day)).toBe(true);
    expect(shouldPush("forum", null, night)).toBe(false);
    expect(shouldPush("hod", null, night)).toBe(true);
    expect(shouldPush("booking_penting", null, night)).toBe(true);
    expect(shouldPush("pengumuman", { pengumuman: false }, night)).toBe(true);
    expect(shouldPush("hod", { hod: false }, day)).toBe(false);
    expect(shouldPush("booking_baru", null, day)).toBe(false);
    expect(shouldPush("booking_baru", { booking_baru: true }, day)).toBe(true);
    expect(shouldPush(null, null, day)).toBe(false);
  });

  it("pushes a booking change only within 24 hours of its start", () => {
    const now = new Date("2026-11-09T03:00:00Z");
    expect(bookingTopic("terbit", "2026-12-01T03:00:00Z", now)).toBe("booking_baru");
    expect(bookingTopic("berubah", "2026-11-10T03:00:00Z", now)).toBe("booking_penting");
    expect(bookingTopic("batal", "2026-11-10T03:00:01Z", now)).toBeNull();
    expect(bookingTopic("batal", "2026-11-09T05:00:00Z", now)).toBe("booking_penting");
  });

  // A save may carry one topic (the switch flipped) or all of them; nothing unknown.
  it("accepts one choice or all of them, and nothing else", () => {
    const all = resolvePrefs({ forum: false });
    expect(pushPrefsSchema.parse({ prefs: all }).prefs).toEqual(all);
    expect(pushPrefsSchema.parse({ prefs: { forum: false } }).prefs).toEqual({ forum: false });
    expect(pushPrefsSchema.safeParse({ prefs: { ...all, lainnya: true } }).success).toBe(false);
    expect(pushPrefsSchema.safeParse({ prefs: { ...all, forum: "off" } }).success).toBe(false);
  });
});

describe("Notifikasi di HP", () => {
  it("turns the base64url key into its bytes", () => {
    expect([...keyBytes("AQID_-8")]).toEqual([1, 2, 3, 255, 239]);
  });

  it("asks an iPhone in Safari to open WAM from its icon first", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1";
    expect(pushSupport({ userAgent: iphone, standalone: false, hasPush: false })).toBe("ios-install");
    expect(pushSupport({ userAgent: iphone, standalone: true, hasPush: true })).toBe("ok");
    expect(pushSupport({ userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130", standalone: false, hasPush: true })).toBe("ok");
    expect(pushSupport({ userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130", standalone: false, hasPush: false })).toBe("unsupported");
  });

  it("names the device by system and browser", () => {
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36")).toBe("Android · Chrome");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1")).toBe("iPhone · Safari");
  });

  it("accepts what a browser's subscription.toJSON() gives, and nothing without keys", () => {
    const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/abc123", expirationTime: null, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } };
    expect(pushSubscriptionSchema.parse({ subscription, device: "Android · Chrome" }).subscription.endpoint).toBe(subscription.endpoint);
    expect(pushSubscriptionSchema.safeParse({ subscription: { endpoint: subscription.endpoint } }).success).toBe(false);
  });
});
