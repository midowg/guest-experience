import type { ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { GaDenied, GaLogin } from "@/components/coffee/ga/GaAuth";
import { HOLD_COOKIE } from "@/components/coffee/ga/hold";
import { coffeePath } from "@/lib/routes";

/*
 * What the server does with /coffee/ga/masuk, the tablet's own sign-in (26 Nov 2026): the form for
 * a stranger, on to Mode GA for someone who may use it (always the tablet itself while a guest
 * holds it: no way around the PIN GA), and a plain refusal for an account without Mode GA.
 * Only an address of Mode GA is ever the way back. Made-up people only.
 */
const mocks = vi.hoisted(() => ({ member: null as unknown, allowed: false, held: false, admin: null as unknown, configured: true }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === HOLD_COOKIE && mocks.held ? { value: "1" } : undefined }) }));
vi.mock("@/lib/server/config", async original => ({ ...(await original<typeof import("@/lib/server/config")>()), isSupabaseConfigured: () => mocks.configured }));
vi.mock("@/lib/server/pra-wam/session", () => ({ currentMember: async () => mocks.member }));
vi.mock("@/lib/server/admin-session", () => ({ currentAdmin: async () => mocks.admin }));
vi.mock("@/lib/server/coffee/session", () => ({ opensGa: async () => mocks.allowed }));

const { default: CoffeeGaSignIn } = await import("./page");
const draw = (next?: string) => CoffeeGaSignIn({ searchParams: Promise.resolve(next === undefined ? {} : { next }) }) as Promise<ReactElement<Record<string, unknown>>>;
const ORDER = coffeePath.gaOrder("0b9d6f0e-1c1c-4c39-9d0b-3d1b3a0d7b11");

beforeEach(() => { Object.assign(mocks, { member: null, allowed: false, held: false, admin: null, configured: true }); });

it("shows a stranger the tablet's sign-in, with nothing of anyone on it", async () => {
  const page = await draw();
  expect(page.type).toBe(GaLogin);
  expect(page.props).toEqual({ next: null, forget: true });
  // A pengelola signed in to the admin on this browser keeps their notifications.
  mocks.admin = { kind: "person" };
  expect((await draw()).props).toEqual({ next: null, forget: false });
  // No database on this server: still the form, nothing is read.
  mocks.configured = false; mocks.member = { id: "p", name: "Contoh" };
  expect((await draw()).type).toBe(GaLogin);
});

it("takes only an address of Mode GA as the way back", async () => {
  expect((await draw(coffeePath.ga)).props.next).toBe(coffeePath.ga);
  expect((await draw(ORDER)).props.next).toBe(ORDER);
  for (const bad of ["https://jahat.example", "//jahat.example", "/\\jahat.example", "/coffee/ga/../../admin", "/coffee/ga/%2e%2e/admin", "/coffee/ga//jahat.example", "/coffee/gaa", "/coffee/ga/",
    coffeePath.home, coffeePath.orders, coffeePath.gaDenied, "/admin/coffee", "/wam", coffeePath.gaLogin(), coffeePath.gaLogin(coffeePath.ga), coffeePath.login(coffeePath.ga), coffeePath.newPassword(coffeePath.ga)]) {
    expect((await draw(bad)).props.next, bad).toBeNull();
  }
});

it("sends someone who may use Mode GA straight on to the tablet", async () => {
  mocks.member = { id: "p-bagas", name: "Bagas Saputra (contoh)", nickname: "Bagas" }; mocks.allowed = true;
  await expect(draw()).rejects.toThrow(`REDIRECT ${coffeePath.ga}`);
  await expect(draw(ORDER)).rejects.toThrow(`REDIRECT ${ORDER}`);
  await expect(draw("https://jahat.example")).rejects.toThrow(`REDIRECT ${coffeePath.ga}`);
  await expect(draw(coffeePath.home)).rejects.toThrow(`REDIRECT ${coffeePath.ga}`);
});

it("is no way around the PIN GA: with a guest holding the tablet it goes back to the book", async () => {
  mocks.member = { id: "p-bagas", name: "Bagas Saputra (contoh)", nickname: "Bagas" }; mocks.allowed = true; mocks.held = true;
  await expect(draw()).rejects.toThrow(`REDIRECT ${coffeePath.ga}`);
  // Never the order the address named, only the tablet's own page (which opens the book again).
  await expect(draw(ORDER)).rejects.toThrow(/REDIRECT \/coffee\/ga$/);
  // The session ran out while the guest held it: the form, and nothing else; signing in leads to the book (the tablet page reads the cookie).
  mocks.member = null;
  const page = await draw();
  expect(page.type).toBe(GaLogin);
  expect(JSON.stringify(page.props)).not.toMatch(/Bagas/);
});

it("tells an account without Mode GA so on the page, and never bounces", async () => {
  mocks.member = { id: "p-rina", name: "Rina Wulandari (contoh)", nickname: "Rina" };
  const page = await draw(coffeePath.ga);
  expect(page.type).toBe(GaDenied);
  expect(page.props).toEqual({ name: "Rina" });
  mocks.member = { id: "p-rina", name: "Rina Wulandari (contoh)", nickname: "" };
  expect((await draw()).props).toEqual({ name: "Rina Wulandari (contoh)" });
});
