import type { ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { CoffeeApp } from "@/components/coffee/CoffeeApp";
import { CoffeeTrouble, CoffeeWaiting } from "@/components/coffee/CoffeeAuth";
import { SETUP_COOKIE } from "@/lib/coffee/setup";
import type { MyState } from "@/lib/coffee/types";
import { coffeePath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";

/*
 * What the server draws for /coffee and /coffee/pesanan (after the F2 audit, 26 Nov 2026): the
 * guard first, "belum dibuka" only while the migration is missing (its name for the pengelola
 * only), "belum bisa memuat" with a way to try again for any other refusal, and the app keyed by
 * the person. Made-up people only.
 */
const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  configured: true,
  state: null as unknown,
  grant: false,
  cookie: undefined as string | undefined,
}));
vi.mock("@/lib/server/config", async original => ({ ...(await original<typeof import("@/lib/server/config")>()), isSupabaseConfigured: () => mocks.configured }));
vi.mock("@/lib/server/coffee/session", () => ({
  requireCoffeePage: async (here: string) => { mocks.calls.push(`guard:${here}`); return { id: "p-rina", name: "Rina (contoh)" }; },
  holdsCoffeeGrant: async () => { mocks.calls.push("grant"); return mocks.grant; },
}));
vi.mock("@/lib/server/coffee/claims", () => ({
  myState: async () => { mocks.calls.push("state"); if (mocks.state instanceof Error) throw mocks.state; return mocks.state; },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => name === SETUP_COOKIE && mocks.cookie ? { value: mocks.cookie } : undefined }),
  headers: async () => ({ get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" }),
}));

const { CoffeeScreen } = await import("./CoffeeScreen");
const sample: MyState = { me: { id: "p-rina", name: "Rina (contoh)", group: "karyawan", quota: 4, used: 0, left: 4, month: "2026-11" }, orders: [], ga: false, pengelola: false, menu: [], options: { suhu: false, gula: false, es: false } };
const draw = (tab: "menu" | "pesanan" = "menu") => CoffeeScreen({ here: tab === "menu" ? coffeePath.home : coffeePath.orders, tab }) as Promise<ReactElement<Record<string, unknown>>>;

beforeEach(() => { Object.assign(mocks, { calls: [], configured: true, state: sample, grant: false, cookie: undefined }); });

it("asks who is signed in before it reads anything, and draws the app for that person", async () => {
  const screen = await draw("pesanan");
  expect(mocks.calls).toEqual([`guard:${coffeePath.orders}`, "state"]);
  expect(screen.type).toBe(CoffeeApp);
  expect(screen.props).toMatchObject({ initial: sample, tab: "pesanan", setup: true, phone: "iphone" });
  // Keyed by the person: nothing of whoever was signed in before is carried into this screen.
  expect(screen.key).toBe("p-rina");
});

it("skips Atur sekali on a device that already walked through it", async () => {
  mocks.cookie = "1";
  expect((await draw()).props.setup).toBe(false);
});

it("says 'belum dibuka' only while the migration is missing, with its name for the pengelola only", async () => {
  mocks.state = new ServiceError(503, "WG Coffee menunggu migrasi 202612010001_coffee.sql.");
  let screen = await draw();
  expect(screen.type).toBe(CoffeeWaiting);
  expect(screen.props.detail).toBeUndefined();
  mocks.grant = true;
  screen = await draw();
  expect(screen.type).toBe(CoffeeWaiting);
  expect(screen.props.detail).toBe("WG Coffee menunggu migrasi 202612010001_coffee.sql.");
});

it("F2-11 says it could not load, with a way to try again, for any other refusal of the server", async () => {
  for (const status of [500, 502, 429]) {
    mocks.state = new ServiceError(status, "Database sedang bermasalah: connection reset.");
    const screen = await draw("pesanan");
    expect(screen.type, String(status)).toBe(CoffeeTrouble);
    expect(screen.props).toEqual({ here: coffeePath.orders });
  }
  // Something that is not the server's own refusal is not swallowed.
  mocks.state = new TypeError("boom");
  await expect(draw()).rejects.toThrow("boom");
});

it("says so without asking anyone when the database is not set up on this server", async () => {
  mocks.configured = false;
  const screen = await draw();
  expect(screen.type).toBe(CoffeeWaiting);
  expect(mocks.calls).toEqual([]);
});
