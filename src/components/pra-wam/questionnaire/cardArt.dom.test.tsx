import { afterEach, expect, it, vi } from "vitest";

// next/font only runs inside Next's compiler.
vi.mock("./font", () => ({ display: { variable: "", style: { fontFamily: "a" } }, body: { variable: "", style: { fontFamily: "b" } } }));
const { phoneWall, WALL } = await import("./cardArt");

const device = (width: number, height: number, touch: boolean) => {
  vi.stubGlobal("screen", { width, height });
  window.matchMedia = ((query: string) => ({ matches: touch && query.includes("coarse"), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
};
afterEach(() => { vi.unstubAllGlobals(); });

it("makes the wallpaper as tall as the phone's screen is shaped, 1080 wide", () => {
  device(390, 844, true);
  expect(phoneWall()).toEqual({ width: 1080, height: 2337 });
  // Held sideways, the same phone.
  device(844, 390, true);
  expect(phoneWall()).toEqual({ width: 1080, height: 2337 });
  device(360, 640, true);
  expect(phoneWall()).toEqual({ width: 1080, height: 1920 });
});

it("keeps the usual size on a computer, and an odd shape within bounds", () => {
  device(1920, 1080, false);
  expect(phoneWall()).toEqual(WALL);
  device(300, 1200, true);
  expect(phoneWall()).toEqual({ width: 1080, height: 2700 });
});
