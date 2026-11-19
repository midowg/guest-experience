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

describe("the front page names no guest page", () => {
  // 19 Nov 2026: the front page opens the apps behind a sign-in (WAM, Booking Kantor, Journey
  // Admin). What guests were sent (invitations, Welcome, handbooks) stays unnamed and unlinked.
  it.each(Object.keys(publicPages))("%s links to no guest page", file => {
    expect(/["'`]\/(welcome|e|friday-sharing|your-visit)[/"'`?]/.test(publicPages[file as keyof typeof publicPages])).toBe(false);
    expect(/eventPath|invitationPath|welcomePath/.test(publicPages[file as keyof typeof publicPages])).toBe(false);
  });

  it("the front page only opens apps that ask for a sign-in", () => {
    const hrefs = [...publicPages["EmptyHome.tsx"].matchAll(/href: (\w+)/g)].map(match => match[1]);
    expect(hrefs).toEqual(["PRA_WAM_PATH", "WELLBEING_PATH", "BOOKING_PATH", "SIGNAGE_PATH", "ADMIN_HOME"]);
  });

  it.each(["not-found.tsx", "error.tsx"])("%s says nothing about signing in", file => {
    expect(/masuk sebagai|pengelola|login|admin/i.test(publicPages[file as keyof typeof publicPages])).toBe(false);
  });

  it("the front page still tells a guest what to do", () => {
    expect(publicPages["EmptyHome.tsx"]).toMatch(/buka tautan yang sudah kami kirimkan/i);
  });
});
