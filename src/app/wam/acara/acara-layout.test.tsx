import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "@/lib/main-wam/settings";
import type { MainWamMode, MainWamViewer } from "@/lib/main-wam/types";

/*
 * Nothing of Main WAM reaches someone it is not shown to (audit M6): no theme (so no KV or colours)
 * from acara/layout, no frame and no loading screen from (app)/layout (WAM's own sign-in instead),
 * and the site's own "not found". The status bar takes Main WAM's page colour only when it shows
 * (T-S01).
 */

let shown = false;
let mode: MainWamMode = "pra";
let viewer: MainWamViewer | null = null;

vi.mock("server-only", () => ({}));
vi.mock("@/components/main-wam/theme/font", () => ({ mainWamFontVars: "font-jakarta" }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock("@/lib/server/main-wam/gate", () => ({ mainWamShown: async () => shown }));
vi.mock("@/lib/server/main-wam/theme", () => ({ mainWamThemeInput: async () => ({ primary: "#C2410C", images: { homeHeader: "/api/wam/acara/tema/homeHeader?v=1" } }) }));
vi.mock("@/lib/server/main-wam/settings", () => ({ readMainWamSettings: async () => ({ ...defaultSettings(), migrated: true, mode }) }));
vi.mock("@/lib/server/main-wam/viewer", () => ({ mainWamViewer: async () => viewer }));
vi.mock("@/lib/server/pra-wam/announcements", () => ({ unreadCount: async () => 2 }));
vi.mock("@/components/main-wam/momen/upload/QueueRunner", () => ({ MomenQueueRunner: () => null }));
vi.mock("@/components/main-wam/modul/absen/AbsenQueue", () => ({ AbsenQueue: () => null }));

const { default: RootLayout, generateViewport } = await import("./layout");
const { default: AppLayout } = await import("./(app)/layout");
const { default: AcaraNotFound } = await import("./not-found");
const { default: SiteNotFound } = await import("@/app/not-found");
const { MainWamTheme } = await import("@/components/main-wam/theme");
const { MainWamShell, SignInFirst } = await import("@/components/main-wam/shell");

const page = <p>Isi</p>;
const person = (tester: boolean, roles: MainWamViewer["roles"] = []): MainWamViewer => ({ id: "11111111-1111-4111-8111-111111111111", name: "Dimas", fullName: "Dimas Contoh", department: "CoE", photo: null, roles, tester, group: null, room: null });
const typeOf = (node: unknown) => (isValidElement(node) ? (node as ReactElement).type : null);

beforeEach(() => { shown = false; mode = "pra"; viewer = null; });

describe("acara/layout: the theme only for whom Main WAM shows", () => {
  it("hidden: the screen as it is, without Main WAM's theme or KV", async () => {
    expect(await RootLayout({ children: page })).toBe(page);
  });

  it("shown: inside MainWamTheme with the admin's theme", async () => {
    shown = true;
    const out = await RootLayout({ children: page }) as ReactElement<{ theme: { primary: string } }>;
    expect(typeOf(out)).toBe(MainWamTheme);
    expect(out.props.theme.primary).toBe("#C2410C");
  });

  it("theme-color: Main WAM's page colour (light and dark entries) when shown, Pra WAM's otherwise (T-S01)", async () => {
    expect(await generateViewport()).toEqual({});
    shown = true;
    expect(await generateViewport()).toEqual({ themeColor: [
      { media: "(prefers-color-scheme: light)", color: "#F6F7F9" },
      { media: "(prefers-color-scheme: dark)", color: "#F6F7F9" },
    ] });
  });
});

describe("(app)/layout: the frame", () => {
  it("nobody signed in, mode pra/uji: no frame, no loading screen, no screen; WAM's sign-in instead", async () => {
    for (const each of ["pra", "uji"] as const) {
      mode = each;
      expect(typeOf(await AppLayout({ children: page }))).toBe(SignInFirst);
    }
  });

  it("nobody signed in, mode semua: the screen (it sends them to Main WAM's sign-in)", async () => {
    mode = "semua";
    expect(await AppLayout({ children: page })).toBe(page);
  });

  it("signed in but not a penguji in mode pra/uji: not found", async () => {
    viewer = person(false);
    for (const each of ["pra", "uji"] as const) {
      mode = each;
      await expect(AppLayout({ children: page })).rejects.toThrow("NOT_FOUND");
    }
  });

  it("a penguji: the frame, with the role on the day line for panitia", async () => {
    viewer = person(true, ["panitia"]);
    const out = await AppLayout({ children: page }) as ReactElement<{ unread: number; greeting: { name: string } }>;
    expect(typeOf(out)).toBe(MainWamShell);
    expect(out.props).toMatchObject({ unread: 2, greeting: { name: "Dimas" } });
  });
});

describe("acara/not-found", () => {
  it("hidden: the site's own not-found, the same as any unknown address under /wam", async () => {
    expect(typeOf(await AcaraNotFound())).toBe(SiteNotFound);
  });

  it("shown: Main WAM's own, back to WAM", async () => {
    shown = true;
    expect(typeOf(await AcaraNotFound())).not.toBe(SiteNotFound);
  });
});
