/*
 * WG Coffee: the drinks and options of the paper menu in the office (photographed 2 Nov 2026),
 * not the JumpStart app's menu. Descriptions follow the paper menu. Photos are AI stand-ins
 * (docs/rancangan-kopi-kantor.md) until the pantry sends real ones.
 */

export type DrinkGroup = "kopi" | "non-kopi";
export type Temperature = "panas" | "es";

export type Drink = {
  slug: string;
  name: string;
  description: string;
  group: DrinkGroup;
  /** Temperatures the drink comes in; the first is the default. */
  temperatures: Temperature[];
};

const both: Temperature[] = ["panas", "es"];

export const DRINKS: Drink[] = [
  { slug: "kopi-susu", name: "Kopi Susu", description: "Kopi hitam dicampur susu, lembut dan manis.", group: "kopi", temperatures: both },
  { slug: "cappuccino", name: "Cappuccino", description: "Espresso, susu panas, dan busa susu yang lembut.", group: "kopi", temperatures: both },
  { slug: "cafe-latte", name: "Café Latte", description: "Espresso dengan lebih banyak susu dan sedikit busa.", group: "kopi", temperatures: both },
  { slug: "cafe-mocha", name: "Café Mocha", description: "Espresso, susu, dan cokelat. Manis dan creamy.", group: "kopi", temperatures: both },
  { slug: "piccolo-latte", name: "Piccolo Latte", description: "Espresso dengan sedikit susu, rasa lebih kuat.", group: "kopi", temperatures: both },
  { slug: "cappuccino-double-shot", name: "Cappuccino Double Shot", description: "Cappuccino dengan dua shot espresso.", group: "kopi", temperatures: both },
  { slug: "matcha-espresso", name: "Matcha Espresso", description: "Matcha susu dengan espresso di atasnya.", group: "kopi", temperatures: both },
  { slug: "kopi-hitam", name: "Kopi Hitam", description: "Kopi murni tanpa susu, pekat.", group: "kopi", temperatures: both },
  { slug: "americano", name: "Americano", description: "Espresso dicampur air, rasa kopi lebih ringan.", group: "kopi", temperatures: both },
  { slug: "espresso", name: "Espresso", description: "Kopi pekat dalam porsi kecil.", group: "kopi", temperatures: ["panas"] },
  { slug: "milk-chocolate", name: "Milk Chocolate", description: "Cokelat manis dicampur susu, rasanya lembut.", group: "non-kopi", temperatures: both },
  { slug: "matcha-latte", name: "Matcha Latte", description: "Matcha dengan susu, teh hijau yang lembut.", group: "non-kopi", temperatures: both },
  { slug: "dark-chocolate", name: "Dark Chocolate", description: "Cokelat hitam dengan susu, sedikit pahit.", group: "non-kopi", temperatures: both },
  { slug: "cucumber-ice", name: "Cucumber Ice", description: "Timun, jeruk nipis, dan mint. Segar.", group: "non-kopi", temperatures: ["es"] },
  { slug: "classic-tea", name: "Classic Tea", description: "Seduhan teh dengan rasa klasik.", group: "non-kopi", temperatures: both },
];

export const SUGAR_LEVELS = ["Tanpa", "Sedikit", "Setengah", "Kurang", "Normal", "Ekstra"] as const;
export const ICE_LEVELS = ["Sedikit", "Normal", "Ekstra"] as const;
export type Sugar = (typeof SUGAR_LEVELS)[number];
export type Ice = (typeof ICE_LEVELS)[number];

/** Claims per calendar month (WIB), the owner's starting values; HR can change them in the admin. */
export const MONTHLY_QUOTA = { karyawan: 4, ga: 2, intern: 2 } as const;
export type QuotaGroup = keyof typeof MONTHLY_QUOTA;
export const GROUP_LABEL: Record<QuotaGroup, string> = { karyawan: "Karyawan", ga: "Tim GA", intern: "Intern" };

/** "Panas · gula Normal" or "Es · gula Sedikit · es Normal". */
export function optionsLabel(temperature: Temperature, sugar: Sugar, ice: Ice) {
  return temperature === "es" ? `Es · gula ${sugar} · es ${ice}` : `Panas · gula ${sugar}`;
}

/** Catat manual only: a drink outside the menu, with its name typed in. */
export const OTHER_DRINK = "lainnya";
const bySlug = new Map(DRINKS.map(drink => [drink.slug, drink]));
export const drinkBySlug = (slug: string): Drink | undefined => bySlug.get(slug);
/** The drink's name as written on the menu; a typed one for "lainnya" ("Lainnya" when nothing was typed). */
export const drinkLabel = (slug: string, other?: string | null) =>
  slug === OTHER_DRINK ? other?.trim() || "Lainnya" : bySlug.get(slug)?.name ?? slug;
