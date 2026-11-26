import type { ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { CoffeeForgot, CoffeeNewPassword } from "@/components/coffee/CoffeeAuth";
import { coffeePath } from "@/lib/routes";

/*
 * Lupa password and Buat password baru as the tablet's sign-in reaches them (26 Nov 2026): both
 * lead back to the tablet (its sign-in, Mode GA), and as before to the employee app otherwise.
 */
const mocks = vi.hoisted(() => ({ member: null as null | { mustChangePassword: boolean } }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); } }));
vi.mock("@/lib/server/pra-wam/session", () => ({ currentMember: async () => mocks.member }));
vi.mock("@/lib/server/coffee/session", () => ({
  requireCoffeePage: async (here: string) => { if (!mocks.member) throw new Error(`REDIRECT ${coffeePath.login(here)}`); return mocks.member; },
}));

const { default: ForgotPage } = await import("./lupa-password/page");
const { default: NewPasswordPage } = await import("./password-baru/page");
type Drawn = ReactElement<Record<string, unknown>>;
const forgot = (query: Record<string, string | string[] | undefined>) => ForgotPage({ searchParams: Promise.resolve(query) }) as Promise<Drawn>;
const fresh = (next?: string) => NewPasswordPage({ searchParams: Promise.resolve(next === undefined ? {} : { next }) }) as Promise<Drawn>;

beforeEach(() => { mocks.member = null; });

it("Lupa password leads back to the tablet's sign-in only when the tablet's sign-in sent the person", async () => {
  const fromTablet = await forgot({ dari: "ga" });
  expect(fromTablet.type).toBe(CoffeeForgot);
  expect(fromTablet.props.back).toBe(coffeePath.gaLogin());
  expect(coffeePath.gaForgot).toBe("/coffee/lupa-password?dari=ga");
  // Anything else in the address is not an address to go to: the employee sign-in, as before.
  for (const query of [{}, { dari: "https://jahat.example" }, { dari: "//jahat.example" }, { dari: ["ga", "x"] }, { next: "https://jahat.example" }]) {
    expect((await forgot(query)).props.back, JSON.stringify(query)).toBeUndefined();
  }
});

it("Buat password baru goes on to Mode GA for someone who signed in on the tablet", async () => {
  mocks.member = { mustChangePassword: true };
  const page = await fresh(coffeePath.ga);
  expect(page.type).toBe(CoffeeNewPassword);
  expect(page.props).toEqual({ next: coffeePath.ga });
  // Nothing to change: straight on to Mode GA.
  mocks.member = { mustChangePassword: false };
  await expect(fresh(coffeePath.ga)).rejects.toThrow(/REDIRECT \/coffee\/ga$/);
  // As before for the employee app, and an address outside the app is dropped.
  mocks.member = { mustChangePassword: true };
  expect((await fresh()).props).toEqual({ next: coffeePath.home });
  expect((await fresh("https://jahat.example")).props).toEqual({ next: coffeePath.home });
  expect((await fresh(coffeePath.gaLogin())).props).toEqual({ next: coffeePath.home });
});

it("without a session Buat password baru sends the tablet to its own sign-in, the phone to the employee one", async () => {
  await expect(fresh(coffeePath.ga)).rejects.toThrow(/REDIRECT \/coffee\/ga\/masuk$/);
  await expect(fresh(coffeePath.orders)).rejects.toThrow(`REDIRECT ${coffeePath.login(coffeePath.newPassword(coffeePath.orders))}`);
  await expect(fresh()).rejects.toThrow(`REDIRECT ${coffeePath.login(coffeePath.newPassword(coffeePath.home))}`);
});
