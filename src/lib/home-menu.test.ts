import { describe, expect, it } from "vitest";
import { defaultHomeMenu, homeAppLabels, homeMenuSchema, readHomeMenu } from "./home-menu";

describe("the front page's app menu", () => {
  it("is the default before anything is saved", () => {
    expect(readHomeMenu(null)).toEqual(defaultHomeMenu);
  });

  it("keeps the saved order and text, and adds apps it lacks at the end", () => {
    const menu = readHomeMenu([{ ...defaultHomeMenu.find(item => item.app === "admin")!, name: "Admin" }, { ...defaultHomeMenu[0], shown: false }]);
    expect(menu.map(item => item.app)).toEqual(["admin", "wam", "wlm", "booking", "hr", "coffee", "signage"]);
    expect(menu[0].name).toBe("Admin");
    expect(menu[1].shown).toBe(false);
  });

  it("ignores unknown apps, repeats and broken fields", () => {
    const menu = readHomeMenu([{ app: "tamu", name: "Undangan" }, { app: "wlm", tone: "red", name: "" }, { app: "wlm", name: "Dua kali" }]);
    expect(menu.map(item => item.app)).toEqual(["wlm", "wam", "booking", "hr", "coffee", "signage", "admin"]);
    expect(menu[0]).toEqual(defaultHomeMenu[1]);
  });

  it("never hides every app", () => {
    expect(readHomeMenu(defaultHomeMenu.map(item => ({ ...item, shown: false }))).every(item => item.shown)).toBe(true);
    expect(homeMenuSchema.safeParse(defaultHomeMenu.map(item => ({ ...item, shown: false }))).success).toBe(false);
  });

  it("accepts only the six apps (WG People since 20 Nov 2026), each once, with a colour", () => {
    expect(homeMenuSchema.safeParse(defaultHomeMenu).success).toBe(true);
    expect(homeMenuSchema.safeParse([...defaultHomeMenu.slice(0, 5), defaultHomeMenu[0]]).success).toBe(false);
    expect(homeMenuSchema.safeParse(defaultHomeMenu.map((item, index) => index ? item : { ...item, tone: "blue" })).success).toBe(false);
  });

  it("has WG Coffee (27 Nov 2026), and gives it to a menu saved before it", () => {
    const saved = defaultHomeMenu.filter(item => item.app !== "coffee");
    const menu = readHomeMenu(saved);
    expect(menu.at(-1)).toMatchObject({ app: "coffee", name: "WG Coffee", shown: true });
    expect(homeAppLabels.coffee).toContain("/coffee");
  });
});
