import { describe, expect, it } from "vitest";
import { parseLocationEmbed } from "./location-embed";
import { eventSchema } from "./validation";
import { createSeedEvent } from "./seed-event";

const url = "https://www.google.com/maps/embed?pb=!1m18!2sWerkudara%20Group";

describe("Google Maps embed input", () => {
  it("extracts a URL from Google's copied iframe and ignores its presentation attributes", () => {
    const html = `<iframe src="${url.replace("&", "&amp;")}" width="800" height="600" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    expect(parseLocationEmbed(html)).toBe(url);
    expect(eventSchema.parse({ ...createSeedEvent(), location_embed_url: html }).location_embed_url).toBe(url);
  });

  it("defaults old event documents to manual mode", () => {
    const legacy = createSeedEvent() as Partial<ReturnType<typeof createSeedEvent>>;
    delete legacy.location_embed_url;
    expect(eventSchema.parse(legacy).location_embed_url).toBe("");
  });

  it("accepts a direct Google embed URL", () => expect(parseLocationEmbed(url)).toBe(url));

  it("rejects other hosts, navigation links, scripts, and extra markup", () => {
    for (const input of [
      "https://maps.app.goo.gl/ctLcnKszth9QX83AA",
      "https://www.google.com.evil.test/maps/embed?pb=!1m18",
      "http://www.google.com/maps/embed?pb=!1m18",
      "https://www.google.com/maps/embed?pb=!1m18&redirect=https://evil.test",
      `<iframe src="${url}" onload="alert(1)"></iframe>`,
      `<iframe src="${url}"></iframe><script>alert(1)</script>`,
      `<iframe src="${url}" src="https://evil.test"></iframe>`,
    ]) {
      expect(parseLocationEmbed(input)).toBeNull();
      expect(eventSchema.safeParse({ ...createSeedEvent(), location_embed_url: input }).success).toBe(false);
    }
  });
});
