import { beforeEach, expect, it, vi } from "vitest";

/* The export route: admin only, logs an export that holds HR answers before the file leaves, and sends no file when that log fails. */
const state = vi.hoisted(() => ({
  admin: true, unlock: null as null | { formId: string; actor: { id: string; name: string } }, includesHr: false, logFails: false,
  logged: [] as string[], readers: [] as { hrOpen: boolean }[], only: [] as (string | null)[],
}));

vi.mock("@/lib/server/admin-session", async () => {
  const { ServiceError } = await import("@/lib/server/config");
  return { requireApiAdmin: async () => { if (!state.admin) throw new ServiceError(401, "Masuk sebagai admin dulu."); return "admin"; } };
});
vi.mock("@/lib/server/pra-wam/hr-lock", () => ({
  hrUnlocked: async () => state.unlock,
  logHrExport: async (unlock: { actor: { id: string } }) => { if (state.logFails) throw new Error("log gagal"); state.logged.push(unlock.actor.id); },
  sameOriginRead: () => {},
}));
vi.mock("@/lib/server/pra-wam/questionnaire", () => ({
  currentForm: async () => ({ id: "f1", name: "Kuesioner", slug: "kuesioner" }),
  questionnaireWaiting: () => new Error("waiting"),
}));
vi.mock("@/lib/server/pra-wam/recap", () => ({
  exportWorkbook: async (_form: unknown, reader: { hrOpen: boolean }, only: string | null) => {
    state.readers.push(reader); state.only.push(only);
    return { file: Buffer.from("PK"), includesHr: state.includesHr, sections: 1 };
  },
}));

const { GET } = await import("./route");
const call = (query = "") => GET(new Request(`https://journey.test/api/admin/wam/questionnaire/export${query}`));

beforeEach(() => {
  Object.assign(state, { admin: true, unlock: null, includesHr: false, logFails: false, logged: [], readers: [], only: [] });
});

it("refuses without the admin session", async () => {
  state.admin = false;
  expect((await call()).status).toBe(401);
  expect(state.readers).toEqual([]);
});

it("exports without HR answers while Data HR is locked, and logs nothing", async () => {
  const response = await call("?bagian=B");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="kuesioner-bagian-b-\d{4}-\d{2}-\d{2}\.xlsx"$/);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(state.readers).toEqual([{ hrOpen: false, facilitator: true }]);
  expect(state.only).toEqual(["B"]);
  expect(state.logged).toEqual([]);
});

it("logs an export with HR answers under the person who opened Data HR, and sends nothing if that fails", async () => {
  state.unlock = { formId: "f1", actor: { id: "hr-1", name: "Orang HR" } };
  state.includesHr = true;
  const response = await call();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-disposition")).toContain("-semua-dengan-hr-");
  expect(state.readers).toEqual([{ hrOpen: true, facilitator: true }]);
  expect(state.logged).toEqual(["hr-1"]);
  state.logFails = true;
  const refused = await call();
  expect(refused.ok).toBe(false);
  expect(refused.headers.get("content-disposition")).toBeNull();
});

it("treats an unlock for another form as locked, and refuses an odd section key", async () => {
  state.unlock = { formId: "lain", actor: { id: "hr-1", name: "Orang HR" } };
  await call();
  expect(state.readers).toEqual([{ hrOpen: false, facilitator: true }]);
  expect((await call("?bagian=..%2Fx")).status).toBe(404);
});
