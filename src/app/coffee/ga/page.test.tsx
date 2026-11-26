import type { ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { CoffeeTrouble, CoffeeWaiting } from "@/components/coffee/CoffeeAuth";
import { GaApp } from "@/components/coffee/ga/GaApp";
import { HOLD_COOKIE } from "@/components/coffee/ga/hold";
import type { GaState } from "@/lib/coffee/types";
import { coffeePath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";

/*
 * What the server draws for /coffee/ga (after the F3 audit, 26 Nov 2026): the guard first; a page
 * reloaded while a guest holds the tablet carries no GA data at all; "belum dibuka" only while the
 * migration is missing; any other refusal offers to try again. Made-up people only.
 */
const mocks = vi.hoisted(() => ({ calls: [] as string[], state: null as unknown, held: false, pin: false, grant: false, menuFails: false }));
const BOOK = vi.hoisted(() => ({ menu: [{ slug: "teh-tarik", name: "Teh Tarik", description: "", group: "non-kopi" as const, temperatures: ["panas" as const], photo: null, active: true }], options: { tim: { suhu: true, gula: true, es: true }, tamu: { suhu: false, gula: true, es: false } } }));
vi.mock("@/lib/server/config", async original => ({ ...(await original<typeof import("@/lib/server/config")>()), isSupabaseConfigured: () => true }));
vi.mock("@/lib/server/coffee/session", () => ({
  requireGaPage: async (here: string) => { mocks.calls.push(`guard:${here}`); return { id: "p-bagas", name: "Bagas Saputra (contoh)", nickname: "Bagas" }; },
  holdsCoffeeGrant: async () => mocks.grant,
}));
vi.mock("@/lib/server/coffee/meetings", () => ({
  gaState: async () => { mocks.calls.push("state"); if (mocks.state instanceof Error) throw mocks.state; return mocks.state; },
  // The menu and what guests are asked: the book's own contents, nothing of GA's.
  gaMenu: async () => { mocks.calls.push("menu"); if (mocks.menuFails) throw new Error("menu"); return BOOK; },
}));
vi.mock("@/lib/server/coffee/pin", () => ({ gaPinSet: async () => { mocks.calls.push("pin"); return mocks.pin; } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === HOLD_COOKIE && mocks.held ? { value: "1" } : undefined }) }));

const { default: CoffeeGaPage } = await import("./page");
const today: GaState = {
  ...BOOK,
  today: [{ id: "o1", no: "T-0113", number: 113, round: 1, parentId: null, room: "Vasuki Room", spot: "vasuki", guest: "PT Rahasia (contoh)", guestCount: 3, status: "diproses", rejectNote: "", orderedAt: "2026-11-26T02:00:00.000Z", items: [], sentBy: "Bagas", manual: false, pic: { id: "p1", name: "Dimas (contoh)" }, processedLabel: "", processedAt: null }],
  people: [{ id: "p1", name: "Dimas (contoh)", position: "Account Manager", bu: "TEE" }], rooms: [{ name: "Vasuki Room", spot: "vasuki" }], pin: true,
};
const draw = () => CoffeeGaPage() as Promise<ReactElement<Record<string, unknown>>>;

beforeEach(() => { Object.assign(mocks, { calls: [], state: today, held: false, pin: false, grant: false, menuFails: false }); });

it("asks who may use Mode GA before it reads anything, then draws the tablet with today's state", async () => {
  const page = await draw();
  expect(mocks.calls).toEqual([`guard:${coffeePath.ga}`, "state"]);
  expect(page.type).toBe(GaApp);
  expect(page.props).toMatchObject({ initial: today, me: { name: "Bagas" } });
  expect(page.props.held).toBeUndefined();
});

it("F3-01 sends no GA data with a page that is loaded while a guest holds the tablet", async () => {
  mocks.held = true; mocks.pin = true;
  const page = await draw();
  // The guard still runs; today's orders and the employees are never read.
  expect(mocks.calls).toEqual([`guard:${coffeePath.ga}`, "pin", "menu"]);
  expect(page.type).toBe(GaApp);
  // F6: the book's own contents come along (the pengelola's menu, what a guest is asked), and nothing else.
  expect(page.props).toMatchObject({ held: true, initial: { ...BOOK, today: [], people: [], rooms: [], pin: true } });
  expect(JSON.stringify(page.props)).not.toMatch(/Rahasia|Dimas|Account Manager/);
});

it("F6 still opens the book, on the code's menu with every option, when the menu cannot be read", async () => {
  mocks.held = true; mocks.menuFails = true;
  const page = await draw();
  const initial = page.props.initial as GaState;
  expect(initial.menu).toHaveLength(15);
  expect(initial.options.tamu).toEqual({ suhu: true, gula: true, es: true });
  expect(initial.today).toEqual([]);
});

it("F3-18 says 'belum dibuka' only while the migration is missing; any other refusal offers to try again", async () => {
  mocks.state = new ServiceError(503, "WG Coffee menunggu migrasi 202612010001_coffee.sql.");
  let page = await draw();
  expect(page.type).toBe(CoffeeWaiting);
  expect(page.props.detail).toBeUndefined();
  mocks.grant = true;
  page = await draw();
  expect(page.props.detail).toMatch(/menunggu migrasi/);
  mocks.state = new ServiceError(500, "Database sedang bermasalah.");
  page = await draw();
  expect(page.type).toBe(CoffeeTrouble);
  expect(page.props).toEqual({ here: coffeePath.ga });
  mocks.state = new TypeError("boom");
  await expect(draw()).rejects.toThrow("boom");
});
