import { expect, it } from "vitest";
import { isShortToken, readEventCode } from "./short-code";

it("reads event codes, flagging lowercase for a redirect", () => {
  expect(readEventCode("AB23CD")).toEqual({ code: "AB23CD", canonical: true });
  expect(readEventCode("ab23cd")).toEqual({ code: "AB23CD", canonical: false });
  expect(readEventCode("ABI3CD")).toBeNull();
  expect(readEventCode("admin")).toBeNull();
  // WG Coffee lives at /coffee: six letters, but the O keeps it from ever being an event code.
  expect(readEventCode("coffee")).toBeNull();
  expect(readEventCode("COFFEE")).toBeNull();
  expect(readEventCode("AB23CDE")).toBeNull();
});

it("knows a short token from page names and long tokens", () => {
  expect(isShortToken("k7q2mx9p")).toBe(true);
  expect(isShortToken("kalender")).toBe(false);
  expect(isShortToken("galeri")).toBe(false);
  expect(isShortToken("a".repeat(64))).toBe(false);
});
