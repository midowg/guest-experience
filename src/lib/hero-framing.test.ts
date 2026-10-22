import { describe, expect, it } from "vitest";
import { defaultFraming, dragFrame, getFraming, normalizeEvent } from "./hero-framing";
import { createSeedEvent } from "./seed-event";
import { eventSchema } from "./validation";
import { prepareEvent } from "@/components/admin/editor/editor-model";
import { previewUpdateSchema } from "./hero-preview";

describe("responsive framing", () => {
  it("defaults old events without losing their focus", () => {
    const event = createSeedEvent(); event.hero.focus = "top";
    expect(normalizeEvent(event).hero.framing).toEqual(defaultFraming("top"));
    expect(getFraming({ ...event.hero, focus: "bottom" }).mobile.y).toBe(100);
  });
  it("keeps the devices independent", () => {
    const framing = defaultFraming(); framing.mobile.x = 10;
    expect(framing.desktop.x).toBe(50);
  });
  it("preserves framing through preparation and validation", () => {
    const event = createSeedEvent(); event.hero.framing = { mobile: { x: 20, y: 80, zoom: 2 }, desktop: { x: 65, y: 30, zoom: 1.2 } };
    expect(eventSchema.parse(prepareEvent(event)).hero.framing).toEqual(event.hero.framing);
  });
  it.each([{ x: -1 }, { x: 101 }, { y: NaN }, { zoom: 0.99 }, { zoom: 3.01 }])("rejects invalid framing %j", patch => {
    const event = createSeedEvent(); event.hero.framing = defaultFraming(); Object.assign(event.hero.framing.mobile, patch);
    expect(eventSchema.safeParse(event).success).toBe(false);
  });
  it("pans by actual cropped image overflow and clamps at the edge", () => {
    const frame = { x: 50, y: 50, zoom: 1 };
    expect(dragFrame(frame, 50, 0, 100, 100, 200, 100).x).toBe(0);
    expect(dragFrame(frame, -1000, 0, 100, 100, 200, 100).x).toBe(100);
    expect(dragFrame(frame, 0, 50, 100, 100, 200, 100).y).toBe(50);
  });
  it("supports zoomed panning even for a matching image ratio", () => {
    expect(dragFrame({ x: 50, y: 50, zoom: 2 }, 50, -50, 100, 100, 100, 100)).toEqual({ x: 0, y: 100, zoom: 2 });
  });
  it("preview accepts incomplete draft title/time but rejects unsafe image URLs", () => {
    const event = { ...createSeedEvent(), title: "", starts_at: "" };
    expect(previewUpdateSchema.safeParse({ type: "hero:update", event, editing: false }).success).toBe(true);
    event.hero.url = "javascript:alert(1)";
    expect(previewUpdateSchema.safeParse({ type: "hero:update", event, editing: false }).success).toBe(false);
  });
});
