import { describe, expect, it } from "vitest";
import { createSeedEvent } from "./seed-event";
import { adminModuleKeys, blockedChanges, moduleActive, withoutModules } from "./admin-modules";
import type { EventRecord } from "./types";

const withSection = (event: EventRecord, key: string, enabled: boolean): EventRecord => ({ ...event, sections: event.sections.map(section => section.key === key ? { ...section, enabled } : section) });

describe("moduleActive", () => {
  it("reads sections, flags, and content", () => {
    const event = createSeedEvent();
    expect(moduleActive(event, "agenda")).toBe(true);
    expect(moduleActive(event, "team")).toBe(false);
    expect(moduleActive(event, "personal")).toBe(false);
    expect(moduleActive({ ...event, invitation_mode: "personal" }, "personal")).toBe(true);
    expect(moduleActive({ ...event, language: "id_en" }, "bilingual")).toBe(true);
    expect(moduleActive({ ...event, review_enabled: true }, "review")).toBe(true);
    expect(moduleActive({ ...event, gallery: [{ id: "x", url: "https://example.test/a.webp", alt: "", caption: "", sort_order: 0, srcset: [] }] }, "gallery")).toBe(true);
  });
});

describe("blockedChanges", () => {
  it("refuses switching on a disabled module", () => {
    const before = createSeedEvent();
    expect(blockedChanges(before, withSection(before, "team", true), ["team"])).toEqual(["team"]);
    expect(blockedChanges(before, { ...before, invitation_mode: "personal" }, ["personal", "team"])).toEqual(["personal"]);
  });
  it("lets an event keep or drop a module it already used", () => {
    const before = withSection(createSeedEvent(), "team", true);
    expect(blockedChanges(before, before, ["team"])).toEqual([]);
    expect(blockedChanges(before, withSection(before, "team", false), ["team"])).toEqual([]);
  });
  it("blocks every disabled module on a brand new event", () => {
    const event = { ...createSeedEvent(), review_enabled: true };
    expect(blockedChanges(null, event, ["review", "team"])).toEqual(["review"]);
  });
});

describe("withoutModules", () => {
  it("leaves nothing a disabled module would bring", () => {
    const event: EventRecord = { ...withSection(withSection(createSeedEvent(), "team", true), "feedback", true), invitation_mode: "personal", language: "en", review_enabled: true, feedback_enabled: true };
    const clean = withoutModules(event, adminModuleKeys);
    for (const key of adminModuleKeys) expect(moduleActive(clean, key), key).toBe(false);
    expect(clean.title).toBe(event.title);
    expect(withoutModules(event, [])).toEqual(event);
  });
});
