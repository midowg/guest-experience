import { expect, it } from "vitest";
import { COFFEE_TABS, coffeeTabLabels, coffeeTabPaths, tabOf } from "./tabs";

it("gives each of the two places its own address under /coffee", () => {
  expect(COFFEE_TABS).toEqual(["menu", "pesanan"]);
  expect(coffeeTabPaths).toEqual({ menu: "/coffee", pesanan: "/coffee/pesanan" });
  expect(coffeeTabLabels.pesanan).toBe("Pesanan saya");
});

it("reads the place from an address; anything else is Menu", () => {
  expect(tabOf("/coffee")).toBe("menu");
  expect(tabOf("/coffee/pesanan")).toBe("pesanan");
  expect(tabOf("/coffee/pesanan?x=1")).toBe("pesanan");
  expect(tabOf("/coffee/ga")).toBe("menu");
  expect(tabOf("/coffeepesanan")).toBe("menu");
  expect(tabOf("/dev-preview/coffee/nyata")).toBe("menu");
  expect(tabOf(null)).toBe("menu");
});
