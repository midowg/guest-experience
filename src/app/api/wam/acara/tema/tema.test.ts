import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "@/lib/main-wam/settings";
import { themeImageAudience } from "@/lib/main-wam/theme-image";
import type { MainWamMode, MainWamSettings } from "@/lib/main-wam/types";

/*
 * The KV route (audit M6, R9/L6, L3): who may fetch which slot in which mode, only the active
 * version, and how long it may be kept.
 */

let settings: MainWamSettings;
let member = false;
const bytes = vi.fn(async () => ({ bytes: new Uint8Array([0x52, 0x49, 0x46, 0x46]), type: "image/webp" }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/main-wam/settings", () => ({ readMainWamSettings: async () => settings }));
vi.mock("@/lib/server/main-wam/theme", () => ({ mayOpenThemeImages: async () => member, themeImageBytes: bytes }));

const { GET } = await import("./[slot]/route");

const image = { key: "main-wam/tema/splash-00000000-0000-4000-8000-000000000001.webp", version: "1737000000000", mime: "image/webp" };
const withMode = (mode: MainWamMode) => {
  const base = defaultSettings();
  settings = { ...base, migrated: true, mode, theme: { ...base.theme, images: { splash: image, homeHeader: { ...image, key: image.key.replace("splash", "homeHeader") } } } };
};
const get = (slot: string, v: string | null = image.version) =>
  GET(new Request(`http://localhost/api/wam/acara/tema/${slot}${v === null ? "" : `?v=${v}`}`), { params: Promise.resolve({ slot }) });

beforeEach(() => { withMode("pra"); member = false; bytes.mockClear(); });

describe("KV images: who (M6)", () => {
  it("mode pra and uji: nothing for a stranger, not even the splash; the penguji and Admin WAM get it, privately", async () => {
    for (const mode of ["pra", "uji"] as const) {
      withMode(mode);
      member = false;
      bytes.mockClear();
      const hidden = await get("splash");
      expect(hidden.status).toBe(404);
      expect(hidden.headers.get("cache-control")).toBe("no-store");
      expect(bytes).not.toHaveBeenCalled();
      member = true;
      const shown = await get("splash");
      expect(shown.status).toBe(200);
      expect(shown.headers.get("cache-control")).toBe("private, max-age=86400");
      expect(shown.headers.get("vary")).toBe("Cookie");
    }
  });

  it("mode semua: the splash and the icon to anyone (cacheable), the rest only to whom Main WAM is shown", async () => {
    withMode("semua");
    const splash = await get("splash");
    expect(splash.status).toBe(200);
    expect(splash.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(splash.headers.get("content-type")).toBe("image/webp");
    expect((await get("homeHeader")).status).toBe(404);
    member = true;
    expect((await get("homeHeader")).status).toBe(200);
  });

  it("an unknown slot, or an empty one, does not exist", async () => {
    member = true;
    expect((await get("logo")).status).toBe(404);
    expect((await get("mosaic")).status).toBe(404);
  });
});

describe("KV images: which version (R9/L6)", () => {
  it("only the active version is served; an old, made-up or missing v is 404 and never cached", async () => {
    withMode("semua");
    for (const v of ["1736000000000", "x", null]) {
      const response = await get("splash", v);
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect((await get("splash", image.version)).status).toBe(200);
  });

  it("a day in caches, not a year (immutable is gone): a removed KV does not live on", async () => {
    withMode("semua");
    const cache = (await get("splash")).headers.get("cache-control") ?? "";
    expect(cache).not.toMatch(/immutable|31536000/);
  });
});

describe("themeImageAudience", () => {
  it("public only for the splash and the icon, only in mode semua", () => {
    expect(themeImageAudience("semua", "splash")).toBe("public");
    expect(themeImageAudience("semua", "icon")).toBe("public");
    for (const slot of ["homeHeader", "pattern", "mosaic"] as const) expect(themeImageAudience("semua", slot)).toBe("member");
    for (const mode of ["pra", "uji"] as const) expect(themeImageAudience(mode, "splash")).toBe("member");
  });
});
