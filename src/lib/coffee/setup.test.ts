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
