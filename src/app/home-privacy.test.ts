import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Comments explain the rule; only shipped code can break it. */
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");

/** Pages a stranger can reach without an invitation link. */
const read = (file: string) => withoutComments(readFileSync(new URL(`./${file}`, import.meta.url), "utf8"));
const publicPages = {
  "page.tsx": read("page.tsx"),
  "EmptyHome.tsx": read("EmptyHome.tsx"),
  "not-found.tsx": read("not-found.tsx"),
  "error.tsx": read("error.tsx"),
};

describe("the management area is not advertised publicly", () => {
  // Anyone can still type /admin; the point is not to point visitors at it.
  it.each(Object.keys(publicPages))("%s links nowhere under /admin", file => {
    expect(/["'`]\/admin/.test(publicPages[file as keyof typeof publicPages])).toBe(false);
  });

  it.each(Object.keys(publicPages))("%s says nothing about signing in", file => {
    expect(/masuk sebagai|pengelola|login|admin/i.test(publicPages[file as keyof typeof publicPages])).toBe(false);
  });

  it("the empty state still tells a guest what to do", () => {
    expect(publicPages["EmptyHome.tsx"]).toMatch(/tautan undangan dari penyelenggara/i);
  });
});
