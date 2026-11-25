import { COFFEE_PATH, coffeePath } from "@/lib/routes";

/*
 * Werkudara Coffee's bottom menu (25 Nov 2026): two places, like a phone app. Each has its own
 * address (a reload or a shared link opens the same place), but moving between them only swaps what
 * is shown; nothing is fetched again. Pure, so it is tested without a browser.
 */
export const COFFEE_TABS = ["menu", "pesanan"] as const;
export type CoffeeTab = (typeof COFFEE_TABS)[number];

export const coffeeTabPaths: Record<CoffeeTab, string> = { menu: coffeePath.home, pesanan: coffeePath.orders };
export const coffeeTabLabels: Record<CoffeeTab, string> = { menu: "Menu", pesanan: "Pesanan saya" };

/** Which place an address shows; anything else (the home, a preview page) is Menu. */
export function tabOf(path: string | null | undefined): CoffeeTab {
  const rest = path?.startsWith(`${COFFEE_PATH}/`) ? path.slice(COFFEE_PATH.length + 1).split(/[/?#]/)[0] : "";
  return rest === "pesanan" ? "pesanan" : "menu";
}
