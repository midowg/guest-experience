import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("loading styles", () => {
  const css = readFileSync(new URL("./loading.module.css", import.meta.url), "utf8");

  it("stops spinning when the viewer asks for less motion", () => {
    const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
    expect(reduced).toContain("animation: none");
  });

  it("still reads as a ring once the spin is off", () => {
    const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
    expect(reduced).toContain("border-right-color");
  });
});

describe("every data-backed page has a loading state", () => {
  // A page that waits on the database should never show a blank screen while it waits.
  const appDir = new URL("../../app/", import.meta.url);
  const routes = ["", "e/[slug]/", "admin/", "admin/login/", "admin/events/[id]/", "admin/events/[id]/responses/", "admin/events/[id]/feedback/", "admin/events/[id]/preview/"];

  it.each(routes)("'%s' has loading.tsx", route => {
    expect(readdirSync(new URL(route, appDir))).toContain("loading.tsx");
  });

  it.each(routes)("'%s' names its own content while loading", route => {
    const source = readFileSync(new URL(`${route}loading.tsx`, appDir), "utf8");
    expect(source).toMatch(/label="Memuat [^"]+"/);
  });
});
