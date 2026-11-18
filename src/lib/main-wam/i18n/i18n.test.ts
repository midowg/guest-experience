import { describe, expect, it } from "vitest";
import { clock, dictionaries, fill, monthName, number, parseLang, shortDate, t, translateKnown, variablesOf } from "./index";
import { id } from "./id";
import { en } from "./en";

describe("the two dictionaries say the same things", () => {
  const idKeys = Object.keys(id).sort();
  it("have exactly the same keys", () => {
    expect(Object.keys(en).sort()).toEqual(idKeys);
  });

  it("have no empty text, and no text with only the key's name", () => {
    for (const lang of ["id", "en"] as const) {
      for (const [key, text] of Object.entries(dictionaries[lang])) {
        expect(text.trim().length, `${lang} ${key} is empty`).toBeGreaterThan(0);
        expect(text, `${lang} ${key} is its own key`).not.toBe(key);
      }
    }
  });

  it("use the same {variables} in both languages", () => {
    for (const key of idKeys as (keyof typeof id)[]) {
      expect(variablesOf(en[key]), `variables of ${key}`).toEqual(variablesOf(id[key]));
    }
  });

  it("keep every plural form closed and with both forms", () => {
    for (const lang of ["id", "en"] as const) {
      for (const [key, text] of Object.entries(dictionaries[lang])) {
        if (!text.includes("plural")) continue;
        expect(/\{\w+,\s*plural,\s*one\s*\{[^{}]*\}\s*other\s*\{[^{}]*\}\s*\}/.test(text), `${lang} ${key}: plural is broken`).toBe(true);
      }
    }
  });

  it("do not leave English identical to Indonesian except for names that are the same in both", () => {
    const allowed = new Set(["Agenda", "Awarding", "Silent Meeting", "WAM", "WhatsApp", "Check-in", "Check-out", "Check-in {time}", "Password", "Dress code: ", "Hotel", "shuttle"]);
    const same = (idKeys as (keyof typeof id)[]).filter(key => id[key] === en[key] && !allowed.has(id[key]) && id[key].replace(/[^A-Za-z]/g, "").length > 3);
    expect(same, "texts still in Indonesian in en.ts").toEqual([]);
  });
});

describe("t and fill", () => {
  it("fills {variables}", () => {
    expect(t("id", "fmt.inMinutes", { n: 20 })).toBe("20 menit lagi");
    expect(t("en", "fmt.inMinutes", { n: 20 })).toBe("in 20 min");
  });

  it("chooses the plural form: one for 1, other for the rest, # is the number", () => {
    expect(fill("{n, plural, one {# photo} other {# photos}}", { n: 1 })).toBe("1 photo");
    expect(fill("{n, plural, one {# photo} other {# photos}}", { n: 0 })).toBe("0 photos");
    expect(fill("{n, plural, one {# photo} other {# photos}}", { n: 12 })).toBe("12 photos");
    expect(t("en", "fmt.people", { n: 1 })).toBe("1 person");
    expect(t("en", "fmt.people", { n: 3 })).toBe("3 people");
    expect(t("id", "fmt.people", { n: 3 })).toBe("3 orang");
  });

  it("leaves a slot with no value as written, so a missing value shows", () => {
    expect(fill("Hi {name}", {})).toBe("Hi {name}");
    expect(fill("Hi {name}")).toBe("Hi {name}");
  });
});

describe("a text that arrives in Indonesian", () => {
  it("is translated when it is exactly a dictionary text, otherwise left alone", () => {
    expect(translateKnown("en", "Tidak ada internet. Periksa sinyal, lalu coba lagi.")).toBe("No internet. Check your signal, then try again.");
    expect(translateKnown("en", "Tulisan yang tidak dikenal")).toBe("Tulisan yang tidak dikenal");
    expect(translateKnown("id", "Tidak ada internet. Periksa sinyal, lalu coba lagi.")).toBe("Tidak ada internet. Periksa sinyal, lalu coba lagi.");
  });
});

describe("the calendar and the clock, always WIB", () => {
  it("says the day and the hour per language", () => {
    expect(shortDate("id", "2027-01-05")).toBe("Sel, 5 Jan");
    expect(shortDate("en", "2027-01-05")).toBe("Tue, 5 Jan");
    expect(clock("id", "08:00")).toBe("08.00");
    expect(clock("en", "08:00")).toBe("08:00");
    expect(monthName("id", "2027-01-05")).toBe("Januari");
    expect(monthName("en", "2027-01-05")).toBe("January");
    expect(number("id", 1240)).toBe("1.240");
    expect(number("en", 1240)).toBe("1,240");
    expect(number("id", 13.6, 1)).toBe("13,6");
    expect(number("en", 13.6, 1)).toBe("13.6");
  });
});

describe("parseLang", () => {
  it("knows id and en; anything else is Indonesian", () => {
    expect(parseLang("en")).toBe("en");
    expect(parseLang("id")).toBe("id");
    for (const other of ["fr", "", undefined, null, 5, "EN"]) expect(parseLang(other)).toBe("id");
  });
});
