import { describe, expect, it } from "vitest";
import { deviceLabel, keyBytes, pushSubscriptionSchema, pushSupport } from "./push";

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
