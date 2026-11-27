import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEED_DRINKS } from "../server/coffee/fake-db";
import { claimText, meetingText } from "./copy-text";
import { claim, item, meeting, person } from "./fixtures";
import { ALL_OPTIONS, DEFAULT_OPTIONS, DRINKS, GUEST_BOOK_ONLY, LEGACY_OPTIONS, MACHINE_MENU, NO_OPTIONS, asksIce, drinkIn, drinkLabel, drinkName, fillChoice, fitChoice, groupsIn, offered, offeredTo, optionsLabel, optionsTail, placeOf, placesWords, showsIn, startChoice } from "./menu";
import { pushFor } from "./notify";
import { detailCells, expandRows } from "./recap";

/* F6: the options a drink is asked with per audience, and the menu's seed. Made-up people only. */

describe("the options a drink carries", () => {
  it("are worded from what is there, and say nothing when nothing was asked", () => {
    expect(optionsLabel("panas", "Normal", null)).toBe("Panas · gula Normal");
    expect(optionsLabel("es", "Sedikit", "Ekstra")).toBe("Es · gula Sedikit · es Ekstra");
    // A row stored before F6: a hot drink with ice "Normal" in the column never reads "es Normal".
    expect(optionsLabel("panas", "Normal", "Normal")).toBe("Panas · gula Normal");
    expect(optionsLabel(null, "Tanpa", null)).toBe("gula Tanpa");
    expect(optionsLabel("es", null, null)).toBe("Es");
    expect(optionsLabel(null, null, "Normal")).toBe("");
    expect(optionsLabel(null, null, null)).toBe("");
    expect(optionsLabel(undefined, undefined, undefined)).toBe("");
    expect(optionsTail("panas", "Normal", null)).toBe(" · Panas · gula Normal");
    expect(optionsTail(null, null, null)).toBe("");
  });

  it("start from the drink's first temperature and Normal where asked, and from nothing where not", () => {
    const latte = drinkIn(DRINKS, "cafe-latte"), cucumber = drinkIn(DRINKS, "cucumber-ice");
    expect(startChoice(latte, ALL_OPTIONS)).toEqual({ temperature: "panas", sugar: "Normal", ice: null });
    expect(startChoice(cucumber, ALL_OPTIONS)).toEqual({ temperature: "es", sugar: "Normal", ice: "Normal" });
    expect(startChoice(latte, NO_OPTIONS)).toEqual({ temperature: null, sugar: null, ice: null });
    expect(startChoice(cucumber, { suhu: true, gula: false, es: false })).toEqual({ temperature: "es", sugar: null, ice: null });
    expect(startChoice(undefined, { suhu: false, gula: true, es: false })).toEqual({ temperature: null, sugar: "Normal", ice: null });
  });

  it("are cut to what is asked, and made whole when a row changes audience", () => {
    expect(fitChoice({ temperature: "es", sugar: "Sedikit", ice: "Ekstra" }, NO_OPTIONS)).toEqual({ temperature: null, sugar: null, ice: null });
    expect(fitChoice({ temperature: "es", sugar: "Sedikit", ice: "Ekstra" }, { suhu: true, gula: true, es: false })).toEqual({ temperature: "es", sugar: "Sedikit", ice: null });
    expect(fitChoice({ temperature: "panas", sugar: "Sedikit", ice: "Ekstra" }, ALL_OPTIONS)).toEqual({ temperature: "panas", sugar: "Sedikit", ice: null });
    expect(asksIce({ suhu: false, gula: false, es: true })).toBe(false);
    // A guest's row that was asked nothing becomes a team member's, who is asked everything.
    expect(fillChoice({ temperature: null, sugar: null, ice: null }, drinkIn(DRINKS, "cucumber-ice"), ALL_OPTIONS)).toEqual({ temperature: "es", sugar: "Normal", ice: "Normal" });
    expect(fillChoice({ temperature: "es", sugar: "Tanpa" }, drinkIn(DRINKS, "espresso"), ALL_OPTIONS)).toEqual({ temperature: "panas", sugar: "Tanpa", ice: null });
    expect(fillChoice({ temperature: "es", sugar: "Tanpa", ice: "Sedikit" }, drinkIn(DRINKS, "cafe-latte"), NO_OPTIONS)).toEqual({ temperature: null, sugar: null, ice: null });
  });

  it("default to nothing for a claim and everything for the team and guests; before the migration everyone is asked everything", () => {
    expect(DEFAULT_OPTIONS).toEqual({ klaim: NO_OPTIONS, tim: ALL_OPTIONS, tamu: ALL_OPTIONS });
    expect(LEGACY_OPTIONS).toEqual({ klaim: ALL_OPTIONS, tim: ALL_OPTIONS, tamu: ALL_OPTIONS });
  });
});

describe("a drink's name", () => {
  it("is the one kept with the order, then the menu's, then the slug", () => {
    expect(drinkLabel("cafe-latte")).toBe("Café Latte");
    expect(drinkLabel("cafe-latte", null, "Latte Susu")).toBe("Latte Susu");
    expect(drinkLabel("teh-tarik", null, "Teh Tarik")).toBe("Teh Tarik");
    expect(drinkLabel("teh-tarik")).toBe("teh-tarik");
    expect(drinkLabel("lainnya", " Wedang uwuh ", "tidak dipakai")).toBe("Wedang uwuh");
    expect(drinkLabel("lainnya")).toBe("Lainnya");
    expect(drinkName({ slug: "sudah-dihapus", name: "Es Kopi Lama" })).toBe("Es Kopi Lama");
  });
  it("only offers what is shown", () => {
    const menu = DRINKS.map(drink => drink.slug === "espresso" ? { ...drink, active: false } : drink);
    expect(offered(menu)).toHaveLength(14);
    expect(drinkIn(menu, "espresso")?.active).toBe(false);
  });
});

describe("an order without options (a claim, by default)", () => {
  const rina = person("p1", "Contoh Rina Putri");
  const bare = { temperature: null, sugar: null, ice: null };
  it("is copied for JumpStart as the drink alone", () => {
    expect(claimText(claim("k1", 415, rina, "cafe-latte", { items: [item("a", "klaim", "cafe-latte", { ...bare, name: "Café Latte" })] }))).toBe("Klaim K-415 · Contoh (Karyawan)\n1× Café Latte");
    const text = meetingText(meeting("m1", 113, rina, [item("a", "tamu", "kopi-susu", { ...bare, qty: 2 }), item("b", "tim", "espresso", { person: rina, sugar: null })]));
    expect(text).toContain("- 2× Kopi Susu\n");
    expect(text).toContain("- 1× Espresso · Panas (Contoh Rina Putri)");
    expect(text).not.toMatch(/gula|es Normal/);
  });
  it("leaves Suhu, Gula and Takaran es empty in the recap", () => {
    const [row] = expandRows([claim("k1", 415, rina, "cafe-latte", { items: [item("a", "klaim", "cafe-latte", bare)] })]);
    expect(detailCells(row).slice(13, 17)).toEqual(["Café Latte", "", "", ""]);
    const [sweet] = expandRows([claim("k2", 416, rina, "cafe-latte", { items: [item("a", "klaim", "cafe-latte", { ...bare, sugar: "Tanpa" })] })]);
    expect(detailCells(sweet).slice(13, 17)).toEqual(["Café Latte", "", "Tanpa", ""]);
  });
  it("keeps the name it was ordered under, in the recap and in the notification", () => {
    const order = claim("k1", 415, rina, "cafe-latte", { items: [item("a", "klaim", "cafe-latte", { ...bare, name: "Latte Susu" })] });
    expect(expandRows([order])[0].drink).toBe("Latte Susu");
    expect(pushFor("klaim_baru", order).body).toBe("Contoh · Latte Susu");
    const gone = claim("k3", 417, rina, "sudah-dihapus", { items: [item("a", "klaim", "sudah-dihapus", { ...bare, name: "Es Kopi Lama" })] });
    expect(expandRows([gone])[0].drink).toBe("Es Kopi Lama");
  });
});

describe("where a drink shows (F7)", () => {
  it("serves guests from the guest book, and claims and the team from the regular menu", () => {
    expect([placeOf("tamu"), placeOf("klaim"), placeOf("tim")]).toEqual(["guestBook", "regular", "regular"]);
    expect(offeredTo(MACHINE_MENU, "tamu")).toHaveLength(15);
    expect(offeredTo(MACHINE_MENU, "klaim")).toHaveLength(12);
    expect(MACHINE_MENU.filter(drink => !showsIn(drink, "regular")).map(drink => drink.slug).sort()).toEqual([...GUEST_BOOK_ONLY].sort());
  });
  it("reads a drink without ticks (a menu from before the migration) as shown in both", () => {
    expect(DRINKS.every(drink => showsIn(drink, "guestBook") && showsIn(drink, "regular"))).toBe(true);
    expect(offeredTo(DRINKS, "klaim")).toHaveLength(15);
  });
  it("offers a hidden drink to nobody, whatever is ticked, and a drink without ticks to nobody either", () => {
    const menu = MACHINE_MENU.map(drink => drink.slug === "kopi-susu" ? { ...drink, active: false } : drink.slug === "espresso" ? { ...drink, guestBook: false, regular: false } : drink);
    for (const who of ["klaim", "tim", "tamu"] as const) expect(offeredTo(menu, who).some(drink => ["kopi-susu", "espresso"].includes(drink.slug))).toBe(false);
    expect(offered(menu).some(drink => drink.slug === "espresso")).toBe(true);
  });
  it("draws a tab only for a kind that has a drink", () => {
    expect(groupsIn(DRINKS)).toEqual(["kopi", "non-kopi"]);
    expect(groupsIn(DRINKS.filter(drink => drink.group === "non-kopi"))).toEqual(["non-kopi"]);
    expect(groupsIn([])).toEqual([]);
  });
  it("says in words where a drink shows", () => {
    expect(placesWords({})).toBe("tampil di Buku tamu dan Menu biasa");
    expect(placesWords({ regular: false })).toBe("hanya tampil di Buku tamu");
    expect(placesWords({ guestBook: false, regular: true })).toBe("hanya tampil di Menu biasa");
    expect(placesWords({ guestBook: false, regular: false })).toBe("tidak tampil di menu mana pun");
  });
});

describe("the menu's seed", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/coffee/202612020001_coffee_menu.sql", import.meta.url), "utf8");
  it("is the same 15 drinks in the code, in the migration and in the tests' stand-in", () => {
    const seeded = [...sql.matchAll(/^\s*\('([a-z0-9-]+)', '([^']+)', '([^']+)', '(kopi|non-kopi)', array\[([^\]]+)\], (\d+)\)/gm)]
      .map(([, slug, name, description, group, temperatures, sort]) => ({ slug, name, description, group, temperatures: temperatures.replace(/'|\s/g, "").split(","), sort: Number(sort) }));
    expect(seeded).toEqual(DRINKS.map((drink, index) => ({ slug: drink.slug, name: drink.name, description: drink.description, group: drink.group, temperatures: drink.temperatures, sort: (index + 1) * 10 })));
    expect(SEED_DRINKS).toEqual(DRINKS.map(drink => [drink.slug, drink.name, drink.group, drink.temperatures]));
  });
  it("is backfilled onto old orders under the same names", () => {
    const block = sql.slice(sql.indexOf("update public.coffee_order_items i set drink_name"));
    const names = [...block.slice(0, block.indexOf(";")).matchAll(/\('([a-z0-9-]+)', '([^']+)'\)/g)].map(([, slug, name]) => [slug, name]);
    expect(names).toEqual(DRINKS.map(drink => [drink.slug, drink.name]));
  });
  it("destroys nothing: no drop, truncate or delete of what is already there, and it is one transaction", () => {
    const code = sql.replace(/\/\*[\s\S]*?\*\/|--.*$/gm, "");
    expect(code).not.toMatch(/\bdrop\s+(table|column|function|index|sequence|constraint)\b/i);
    expect(code).not.toMatch(/\btruncate\b/i);
    // The only delete is inside coffee_delete_drink (one drink of the menu that no order ever used).
    expect([...code.matchAll(/\bdelete\s+from\s+(\S+)/gi)].map(match => match[1])).toEqual(["coffee_drinks"]);
    // The only write to old rows fills the new, empty drink_name.
    expect([...code.matchAll(/^update\s+(\S+)\s+\S+\s+set\s+(\w+)/gim)].map(match => `${match[1]}.${match[2]}`)).toEqual(["public.coffee_order_items.drink_name"]);
    expect(code.trim().startsWith("begin;")).toBe(true);
    expect(code.trim().endsWith("commit;")).toBe(true);
  });
});
