import { beforeEach, expect, it, vi } from "vitest";
import { fakeDb, PEOPLE, seedPeople } from "./fake-db";

/* Who opens WG Coffee's pages and Mode GA, and how the pengelola is named. Made-up people. */
const state = vi.hoisted(() => ({ member: null as unknown, admin: null as unknown }));
let db = fakeDb();

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); } }));
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => db.client }));
vi.mock("../admin-session", () => ({ currentAdmin: async () => state.admin }));
vi.mock("../pra-wam/session", async () => {
  const { ServiceError } = await import("../config");
  return { currentMember: async () => state.member, requireApiMember: async () => { if (!state.member) throw new ServiceError(401, "Sesi berakhir."); return state.member; } };
});

const { coffeeActor, holdsCoffeeGrant, requireApiGa, requireCoffeePage, requireGaPage } = await import("./session");
const member = (id: string, category: string, roles: string[] = []) => ({ id, name: "Contoh", nickname: "Contoh", category, roles });

beforeEach(() => { db = fakeDb(); seedPeople(db); state.member = null; state.admin = null; });

it("sends a stranger to Coffee's own sign-in, and back to where they were", async () => {
  await expect(requireCoffeePage("/coffee/pesanan")).rejects.toThrow("REDIRECT /coffee/masuk?next=%2Fcoffee%2Fpesanan");
  await expect(requireGaPage("/coffee/ga")).rejects.toThrow("REDIRECT /coffee/masuk?next=%2Fcoffee%2Fga");
  state.member = member(PEOPLE.rina, "karyawan");
  expect(await requireCoffeePage("/coffee")).toBe(state.member);
});

it("opens Mode GA for the GA group, Admin Booking and holders of the Coffee grant; others land on the app with a note", async () => {
  state.member = member(PEOPLE.rina, "karyawan");
  await expect(requireGaPage("/coffee/ga")).rejects.toThrow("REDIRECT /coffee?pesan=ga");
  await expect(requireApiGa()).rejects.toMatchObject({ status: 403, message: "Mode GA hanya untuk tim GA dan pengelola WG Coffee." });
  for (const allowed of [member(PEOPLE.bagas, "dw"), member(PEOPLE.rina, "karyawan", ["ga"]), member(PEOPLE.dewi, "karyawan")]) {
    state.member = allowed;
    expect(await requireGaPage("/coffee/ga")).toBe(allowed);
    expect(await requireApiGa()).toBe(allowed);
  }
  state.member = null;
  await expect(requireApiGa()).rejects.toMatchObject({ status: 401 });
});

it("reads the Coffee grant from Akses admin; no row, another app or no table is no", async () => {
  expect(await holdsCoffeeGrant(PEOPLE.dewi)).toBe(true);
  expect(await holdsCoffeeGrant(PEOPLE.rina)).toBe(false);
  db.rows("admin_grants").push({ employee_id: PEOPLE.rina, apps: ["hr"] });
  expect(await holdsCoffeeGrant(PEOPLE.rina)).toBe(false);
});

it("names the pengelola by nickname with their employee row, and the super admin without one", async () => {
  expect(await coffeeActor()).toEqual({ employeeId: null, label: "Admin" });
  state.admin = { role: "super", kind: "super", name: "Super admin" };
  expect(await coffeeActor()).toEqual({ employeeId: null, label: "Super admin" });
  state.admin = { role: "admin", kind: "person", name: "Contoh Dewi Lestari", employeeId: PEOPLE.dewi };
  expect(await coffeeActor()).toEqual({ employeeId: PEOPLE.dewi, label: "Dewi" });
  db.rows("employees").find(row => row.id === PEOPLE.dewi)!.nickname = "";
  expect(await coffeeActor()).toEqual({ employeeId: PEOPLE.dewi, label: "Contoh" });
});
