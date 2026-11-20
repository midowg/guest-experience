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

  // The addresses are fixed in EmptyHome.tsx; the menu the super admin edits only names and orders these apps.
  it("the front page only opens apps that ask for a sign-in", () => {
    const hrefs = [...publicPages["EmptyHome.tsx"].matchAll(/href: ([A-Z_]+)\b/g)].map(match => match[1]);
    expect(hrefs).toEqual(["PRA_WAM_PATH", "WELLBEING_PATH", "BOOKING_PATH", "HR_PATH", "SIGNAGE_PATH", "ADMIN_HOME"]);
  });

  it.each(["not-found.tsx", "error.tsx"])("%s says nothing about signing in", file => {
    expect(/masuk sebagai|pengelola|login|admin/i.test(publicPages[file as keyof typeof publicPages])).toBe(false);
  });

  // 20 Nov 2026: Main WAM (the app during WAM itself, Kuis live included) stays out of sight in Journey until
  // the super admin shows it; the front page never names it or links to it, shown or not.
  it.each(Object.keys(publicPages))("%s names no Main WAM, no Kuis and no WAM event feature", file => {
    const source = publicPages[file as keyof typeof publicPages];
    expect(/main[ -]?wam|\/wam\/acara|mainWam|kuis|momen|mozaik|awarding|rundown/i.test(source)).toBe(false);
  });

  it("the default app menu names no Main WAM or Kuis either", () => {
    const menu = withoutComments(readFileSync(new URL("../lib/home-menu.ts", import.meta.url), "utf8"));
    expect(/main[ -]?wam|\/wam\/acara|mainWam|kuis|momen|mozaik|awarding|rundown/i.test(menu)).toBe(false);
  });

  it("the front page still tells a guest what to do", () => {
    expect(publicPages["EmptyHome.tsx"]).toMatch(/buka tautan yang sudah kami kirimkan/i);
  });
});
