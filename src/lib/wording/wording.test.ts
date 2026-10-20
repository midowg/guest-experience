import { describe, expect, it } from "vitest";
import { createSeedEvent } from "@/lib/seed-event";
import { en, id, type WordKey } from "./dictionary";
import { defaultLang, offersSwitch, t } from "./index";
import { localizeEvent, translationGaps } from "./localize";

describe("dictionary", () => {
  it("has Indonesian text for every key and only known variables", () => {
    const known = new Set(["name", "date", "time", "minutes", "teaser", "when", "place", "answer", "zone", "zoneName", "n", "total", "offset"]);
    for (const key of Object.keys(id) as WordKey[]) {
      expect(id[key].trim(), key).not.toBe("");
      for (const text of [id[key], en[key]]) for (const [, name] of text.matchAll(/\{(\w+)\}/g)) expect(known.has(name), `${key}: {${name}}`).toBe(true);
    }
  });
});

describe("t", () => {
  it("fills variables in either language", () => {
    expect(t("id", "hero.to", { name: "Bu Sari" })).toBe("Kepada Bu Sari");
    expect(t("en", "hero.to", { name: "Ms Sari" })).toBe("Dear Ms Sari");
    expect(t("en", "gallery.position", { n: 2, total: 5 })).toBe("2 of 5");
  });
  it("leaves an unfilled variable visible rather than inventing text", () => {
    expect(t("id", "hero.to")).toBe("Kepada {name}");
  });
  it("maps the event's language setting", () => {
    expect([defaultLang("id"), defaultLang("en"), defaultLang("id_en"), defaultLang(undefined)]).toEqual(["id", "en", "id", "id"]);
    expect([offersSwitch("id"), offersSwitch("en"), offersSwitch("id_en")]).toEqual([false, false, true]);
  });
});

function bilingual() {
  const event = createSeedEvent();
  event.language = "id_en";
  event.topics = [{ title: "Rencana kerja", description: "Pembagian peran", en: { title: "Work plan", description: "" } }];
  event.prepare.items = [{ icon: "backpack", title: "Yang perlu dibawa", description: "", list: ["KTP"], en: { title: "What to bring", description: "", list: ["ID card"] } }];
  event.translations.en.title = "Core Committee Meeting";
  event.translations.en.agenda = { [event.agenda[0].id]: { title: "Arrival", description: "" } };
  return event;
}

describe("localizeEvent", () => {
  it("returns the event untouched in Indonesian", () => {
    const event = bilingual();
    expect(localizeEvent(event, "id")).toEqual({ event, fallback: false });
  });
  it("swaps in English texts and keeps Indonesian where none exists", () => {
    const event = bilingual();
    const { event: english, fallback } = localizeEvent(event, "en");
    expect(english.title).toBe("Core Committee Meeting");
    expect(english.introduction).toBe(event.introduction);
    expect(english.topics[0]).toMatchObject({ title: "Work plan", description: "Pembagian peran" });
    expect(english.agenda[0].title).toBe("Arrival");
    expect(english.agenda[1].title).toBe(event.agenda[1].title);
    expect(english.prepare.items[0]).toMatchObject({ title: "What to bring", list: ["ID card"] });
    expect(fallback).toBe(true);
  });
  it("reports no fallback once every filled text is translated", () => {
    const event = createSeedEvent();
    event.title = "Rapat"; event.subtitle = ""; event.greeting = ""; event.introduction = ""; event.closing = ""; event.arrival_notes = "";
    event.feedback_description = ""; event.topics = []; event.agenda = []; event.contact = { ...event.contact, heading: "", description: "" };
    event.review_heading = ""; event.review_description = ""; event.review_button_label = "";
    event.translations.en.title = "Meeting";
    expect(localizeEvent(event, "en").fallback).toBe(false);
    expect(translationGaps(event)).toEqual({ total: 1, missing: 0 });
  });
});

describe("translationGaps", () => {
  it("counts only Indonesian texts that are filled in", () => {
    const event = bilingual();
    const { total, missing } = translationGaps(event);
    expect(total).toBeGreaterThan(0);
    expect(missing).toBeLessThan(total);
    event.translations.en.title = "";
    expect(translationGaps(event).missing).toBe(missing + 1);
  });
});
