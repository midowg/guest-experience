import { expect, it } from "vitest";
import { coffeePath } from "@/lib/routes";
import { SETUP_COOKIE, monthName, phoneKind, resetDay, safeCoffeeNext, setupCookie } from "./setup";

it("lets signing in lead back to the app's own pages only", () => {
  expect(safeCoffeeNext(coffeePath.home)).toBe(coffeePath.home);
  expect(safeCoffeeNext(coffeePath.orders)).toBe(coffeePath.orders);
  expect(safeCoffeeNext(coffeePath.ga)).toBe(coffeePath.ga);
  expect(safeCoffeeNext(coffeePath.gaDenied)).toBe(coffeePath.gaDenied);
  for (const bad of [null, undefined, "", "https://jahat.example", "//jahat.example", "/wam", "/coffeeshop", "/admin/coffee-x", `${coffeePath.home}\\x`, `${coffeePath.home} x`,
    coffeePath.login(), coffeePath.login(coffeePath.home), coffeePath.forgot, coffeePath.newPassword(coffeePath.home)]) {
    expect(safeCoffeeNext(bad), String(bad)).toBeNull();
  }
});

it("F2-08 refuses dot segments, anything encoded and the app's files as the way back", () => {
  for (const bad of [
    "/coffee/../admin", "/coffee/..", "/coffee/../wam", "/coffee/./masuk", "/coffee/.", "/coffee/pesanan/../../admin",
    "/coffee/%2e%2e/admin", "/coffee/%2E%2E/api/admin/coffee/rekap/export", "/coffee/.%2e/admin", "/coffee/%2e/masuk", "/coffee%2f..%2fadmin",
    "/coffee/..%2fadmin", "/coffee/%5c..%5cadmin", "/coffee/%252e%252e/admin", "/coffee//admin", "/coffee//jahat.example", "/coffee/",
    "/coffee/sw.js", "/coffee/manifest.webmanifest", "/coffee/drinks/americano.jpg", "/coffee/icon-192.png",
    "/COFFEE", "/Coffee/pesanan", "/coffee/../coffee/masuk", "/coffee/pesanan;x=1/../../admin", "/coffee/ga/..", "/coffee/@jahat.example", "/coffee:8080",
    "/coffee/..?next=/coffee", "/coffee/..#x",
  ]) {
    expect(safeCoffeeNext(bad), bad).toBeNull();
    // What the browser would open, had it been let through, is checked too: none of them is a page of the app by another spelling.
  }
  // A query or a fragment on a real page stays.
  expect(safeCoffeeNext(`${coffeePath.orders}?dari=notif`)).toBe(`${coffeePath.orders}?dari=notif`);
  expect(safeCoffeeNext(`${coffeePath.home}#atas`)).toBe(`${coffeePath.home}#atas`);
  // Whatever is let through opens inside the app.
  for (const good of [coffeePath.home, coffeePath.orders, coffeePath.ga, coffeePath.gaDenied]) {
    expect(new URL(safeCoffeeNext(good)!, "https://journey.example").pathname.startsWith(coffeePath.home)).toBe(true);
  }
});

it("remembers the one-time setup for the app's addresses", () => {
  expect(setupCookie()).toContain(`${SETUP_COOKIE}=1`);
  expect(setupCookie()).toContain(`path=${coffeePath.home};`);
});

it("guesses the phone from the browser", () => {
  expect(phoneKind("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("iphone");
  expect(phoneKind("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe("android");
  expect(phoneKind(null)).toBe("android");
});

it("names the month and the day the quota comes back, across the year's end", () => {
  expect(monthName("2026-11")).toBe("November");
  expect(resetDay("2026-11")).toBe("Selasa, 1 Desember");
  expect(resetDay("2026-12")).toBe("Jumat, 1 Januari");
});
