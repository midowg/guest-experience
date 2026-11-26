import "server-only";
import { OTHER_DRINK, type Audience, type Choice, type CoffeeOptions, type Drink, type Ice, type Sugar, type Temperature } from "@/lib/coffee/menu";
import { isDrinkIssue, settleLine } from "@/lib/coffee/schemas";
import { ServiceError } from "../config";
import { readOptions } from "./settings";
import { coffeeError, readMenu } from "./store";

/*
 * A drink line on its way into an order (F6): is the drink on the menu and shown, and which of
 * temperature, sugar and ice count for its audience. The browser's values are never trusted: an
 * option that is off is dropped here (saved as NULL), one that is on must be there. The database
 * function checks the drink once more under a lock (a drink hidden a second ago), and copies its
 * name onto the row.
 */

export type OrderRules = { menu: ReadonlyMap<string, Drink>; options: CoffeeOptions };
export async function orderRules(): Promise<OrderRules> {
  const [menu, { options }] = await Promise.all([readMenu(), readOptions()]);
  return { menu: new Map(menu.map(drink => [drink.slug, drink])), options };
}

type Line = { slug: string; temperature?: Temperature | null; sugar?: Sugar | null; ice?: Ice | null };
/**
 * `manual`: Catat manual, where a hidden drink and "lainnya" may still be recorded. `path`: where
 * the line sits in the request ("items.2."), so the message lands on its own field.
 */
export function settle(line: Line, audience: Audience, rules: OrderRules, { manual = false, path = "" } = {}): Choice {
  const drink = rules.menu.get(line.slug);
  if (line.slug === OTHER_DRINK ? !manual : !drink || (!drink.active && !manual)) coffeeError({ message: "COFFEE_DRINK_GONE" });
  const settled = settleLine(line, drink, rules.options[audience]);
  if (isDrinkIssue(settled)) throw new ServiceError(422, "Pilihan minuman berubah. Tutup lalu buka lagi minumannya, kemudian pilih ulang.", { [`${path}${settled.field}`]: [settled.message] });
  return settled;
}
