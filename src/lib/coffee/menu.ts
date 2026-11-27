/*
 * WG Coffee: the drinks and options of the paper menu in the office (photographed 2 Nov 2026),
 * not the JumpStart app's menu. Descriptions follow the paper menu. Photos are AI stand-ins
 * (docs/rancangan-kopi-kantor.md) until the pantry sends real ones.
 *
 * Since F6 (26 Nov 2026) the menu lives in the database (coffee_drinks, managed by the pengelola
 * in /admin/coffee → Menu) and DRINKS is what it was seeded from: the fallback while migration
 * 202612020001 has not run, and the menu of the previews and the tests. Screens take the menu
 * they are handed (MyState.menu, GaState.menu); they do not read DRINKS themselves.
 */

import { coffeePath } from "@/lib/routes";

export type DrinkGroup = "kopi" | "non-kopi";
export type Temperature = "panas" | "es";

export type Drink = {
  slug: string;
  name: string;
  description: string;
  group: DrinkGroup;
  /** Temperatures the drink comes in; the first is the default. */
  temperatures: Temperature[];
  /** Where its photo is served from; null: no photo (a cup is drawn instead). */
  photo: string | null;
  /** Hidden drinks (false) cannot be ordered; they still show in the history. */
  active: boolean;
  /**
   * Where the drink shows (F7, 27 Nov 2026). "Buku tamu": the GA tablet's guest menu book, and what
   * a Tamu line may be. "Menu biasa": the employee app, and what a Tim · rapat line and a claim may
   * be. Absent reads as true: a menu from before migration 202612030001 shows every drink in both.
   */
  guestBook?: boolean;
  regular?: boolean;
};

/** The two places a drink can show in. */
export type MenuPlace = "guestBook" | "regular";
export const MENU_PLACES = ["guestBook", "regular"] as const satisfies readonly MenuPlace[];
export const PLACE_LABEL: Record<MenuPlace, string> = { guestBook: "Buku tamu", regular: "Menu biasa" };
/** Which menu an audience is served from: guests from the guest book; employees and the team in a meeting from the regular menu. */
export const placeOf = (audience: "klaim" | "tim" | "tamu"): MenuPlace => audience === "tamu" ? "guestBook" : "regular";
/** Is the drink ticked for that place? (Says nothing about hidden: see `offeredTo`.) */
export const showsIn = (drink: Pick<Drink, MenuPlace>, place: MenuPlace): boolean => drink[place] !== false;
/** "tampil di Buku tamu dan Menu biasa", "hanya tampil di Buku tamu", "hanya tampil di Menu biasa", "tidak tampil di menu mana pun". */
export const placesWords = (drink: Pick<Drink, MenuPlace>): string => {
  const book = showsIn(drink, "guestBook"), regular = showsIn(drink, "regular");
  return book && regular ? "tampil di Buku tamu dan Menu biasa" : book ? "hanya tampil di Buku tamu" : regular ? "hanya tampil di Menu biasa" : "tidak tampil di menu mana pun";
};
export const DRINK_GROUPS = ["kopi", "non-kopi"] as const satisfies readonly DrinkGroup[];
export const DRINK_GROUP_LABEL: Record<DrinkGroup, string> = { kopi: "Kopi", "non-kopi": "Non-kopi" };
/** The groups that have a drink in this list, in their usual order: a tab is only drawn for these. */
export const groupsIn = (drinks: readonly Pick<Drink, "group">[]): DrinkGroup[] => DRINK_GROUPS.filter(group => drinks.some(drink => drink.group === group));

const both: Temperature[] = ["panas", "es"];
/** The static photo of one of the first 15 drinks (public/coffee/drinks). */
export const staticPhoto = (slug: string) => coffeePath.photo(slug);
type Seed = Omit<Drink, "photo" | "active">;

const SEED: Seed[] = [
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
export const DRINKS: Drink[] = SEED.map(drink => ({ ...drink, photo: staticPhoto(drink.slug), active: true }));

export const SUGAR_LEVELS = ["Tanpa", "Sedikit", "Setengah", "Kurang", "Normal", "Ekstra"] as const;
export const ICE_LEVELS = ["Sedikit", "Normal", "Ekstra"] as const;
export type Sugar = (typeof SUGAR_LEVELS)[number];
export type Ice = (typeof ICE_LEVELS)[number];

/** Claims per calendar month (WIB), the owner's starting values; HR can change them in the admin. */
export const MONTHLY_QUOTA = { karyawan: 4, ga: 2, intern: 2 } as const;
export type QuotaGroup = keyof typeof MONTHLY_QUOTA;
export const GROUP_LABEL: Record<QuotaGroup, string> = { karyawan: "Karyawan", ga: "Tim GA", intern: "Intern" };

/*
 * Which options a drink is asked with, per audience (F6): an employee's own claim (klaim), a team
 * member in a meeting (tim), a guest (tamu). Employees are self-service at the machine, so a claim
 * asks nothing by default; guests and the team are served by GA. The pengelola changes them in
 * Pengaturan. "es" (takaran es) only means something with "suhu" on and a cold drink.
 */
export type DrinkOptions = { suhu: boolean; gula: boolean; es: boolean };
export type Audience = "klaim" | "tim" | "tamu";
export type CoffeeOptions = Record<Audience, DrinkOptions>;
export const AUDIENCES = ["klaim", "tim", "tamu"] as const satisfies readonly Audience[];
export const OPTION_KEYS = ["suhu", "gula", "es"] as const satisfies readonly (keyof DrinkOptions)[];
export const ALL_OPTIONS: DrinkOptions = { suhu: true, gula: true, es: true };
export const NO_OPTIONS: DrinkOptions = { suhu: false, gula: false, es: false };
/** The owner's starting values (the defaults of migration 202612020001). */
export const DEFAULT_OPTIONS: CoffeeOptions = { klaim: { ...NO_OPTIONS }, tim: { ...ALL_OPTIONS }, tamu: { ...ALL_OPTIONS } };
/** Before that migration runs: every option for everyone, as the app has always asked. */
export const LEGACY_OPTIONS: CoffeeOptions = { klaim: { ...ALL_OPTIONS }, tim: { ...ALL_OPTIONS }, tamu: { ...ALL_OPTIONS } };
export const AUDIENCE_LABEL: Record<Audience, string> = { klaim: "Karyawan (klaim)", tim: "Tim · rapat", tamu: "Tamu" };
export const OPTION_LABEL: Record<keyof DrinkOptions, string> = { suhu: "Suhu (Panas/Es)", gula: "Gula", es: "Takaran es" };
/** Takaran es is only asked together with the temperature. */
export const asksIce = (options: DrinkOptions) => options.suhu && options.es;

export type Choice = { temperature: Temperature | null; sugar: Sugar | null; ice: Ice | null };
/**
 * What a screen starts a drink with, for the options its audience is asked: the drink's first
 * temperature and "Normal" where asked, null where not (never a made-up value).
 */
export const startChoice = (drink: Pick<Drink, "temperatures"> | undefined, options: DrinkOptions): Choice => ({
  temperature: options.suhu ? drink?.temperatures[0] ?? "panas" : null,
  sugar: options.gula ? "Normal" : null,
  ice: asksIce(options) && (drink?.temperatures[0] ?? "panas") === "es" ? "Normal" : null,
});
/** A choice cut to the options asked: what is not asked is null, and ice only stays with a cold drink. */
export const fitChoice = (choice: Partial<Choice>, options: DrinkOptions): Choice => {
  const temperature = options.suhu ? choice.temperature ?? null : null;
  return { temperature, sugar: options.gula ? choice.sugar ?? null : null, ice: asksIce(options) && temperature === "es" ? choice.ice ?? "Normal" : null };
};

/**
 * A choice made whole for the options asked: a temperature the drink comes in (its first one when
 * the one given does not fit or is missing), "Normal" for a sugar or ice level that is asked but
 * missing, and null for everything that is not asked. For a row that changes audience (a guest's
 * drink that becomes a team member's) or is read back from the tablet's storage.
 */
export const fillChoice = (choice: Partial<Choice>, drink: Pick<Drink, "temperatures"> | undefined, options: DrinkOptions): Choice => {
  const temps = drink?.temperatures ?? ["panas", "es"];
  const temperature = choice.temperature && temps.includes(choice.temperature) ? choice.temperature : temps[0];
  return fitChoice({ temperature, sugar: choice.sugar ?? "Normal", ice: choice.ice ?? "Normal" }, options);
};

/**
 * "Panas · gula Normal", "Es · gula Sedikit · es Normal", "gula Normal", "Es", or "" when nothing
 * was asked: only what the order really carries, never an invented default.
 */
export function optionsLabel(temperature: Temperature | null | undefined, sugar: Sugar | null | undefined, ice: Ice | null | undefined) {
  return [
    temperature === "es" ? "Es" : temperature === "panas" ? "Panas" : "",
    sugar ? `gula ${sugar}` : "",
    temperature === "es" && ice ? `es ${ice}` : "",
  ].filter(Boolean).join(" · ");
}
/** The same, led by " · " when there is something to say: for a line that already starts with the drink. */
export const optionsTail = (temperature: Temperature | null | undefined, sugar: Sugar | null | undefined, ice: Ice | null | undefined) => {
  const text = optionsLabel(temperature, sugar, ice);
  return text ? ` · ${text}` : "";
};

/** Catat manual only: a drink outside the menu, with its name typed in. */
export const OTHER_DRINK = "lainnya";
const bySlug = new Map(DRINKS.map(drink => [drink.slug, drink]));
/** A drink of the code's menu (the seed). Screens look a drink up in the menu they were handed instead (`drinkIn`). */
export const drinkBySlug = (slug: string): Drink | undefined => bySlug.get(slug);
export const drinkIn = (menu: readonly Drink[], slug: string): Drink | undefined => menu.find(drink => drink.slug === slug);
/**
 * The drink's name: a typed one for "lainnya" ("Lainnya" when nothing was typed); else the name
 * kept with the order (`name`, as it was when ordered), then the code's menu, then the slug.
 */
export const drinkLabel = (slug: string, other?: string | null, name?: string | null) =>
  slug === OTHER_DRINK ? other?.trim() || "Lainnya" : name?.trim() || bySlug.get(slug)?.name || slug;
/** The same for anything that carries a drink (an order's item, a claim). */
export const drinkName = (line: { slug: string; other?: string | null; name?: string | null }) => drinkLabel(line.slug, line.other, line.name);

/** The menu in its order, hidden drinks left out: what can be ordered now. */
export const offered = (menu: readonly Drink[]): Drink[] => menu.filter(drink => drink.active);
/** What can be ordered now for that audience: shown, and ticked for the menu the audience is served from. */
export const offeredTo = (menu: readonly Drink[], audience: "klaim" | "tim" | "tamu"): Drink[] => menu.filter(drink => drink.active && showsIn(drink, placeOf(audience)));
/**
 * The owner's starting choice (27 Nov 2026, the defaults of migration 202612030001): the paper
 * menu (all 15 drinks) is the guest book; the regular menu is what the office machine (JS Mini)
 * makes, because employees serve themselves there. These three paper-menu drinks the machine does
 * not make are guest book only.
 */
export const GUEST_BOOK_ONLY = ["cappuccino-double-shot", "cucumber-ice", "classic-tea"] as const;
/** The menu as that migration leaves it on a database nobody edited: for the previews and the tests. */
export const MACHINE_MENU: Drink[] = DRINKS.map(drink => ({ ...drink, guestBook: true, regular: !(GUEST_BOOK_ONLY as readonly string[]).includes(drink.slug) }));
