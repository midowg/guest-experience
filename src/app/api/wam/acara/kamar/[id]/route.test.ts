import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "@/lib/main-wam/settings";
import type { MainWamSettings, MainWamViewer, ViewerRoom } from "@/lib/main-wam/types";

/*
 * Kamar → teman sekamar: GET /api/wam/acara/kamar/[id], through the real gate and the real loader. Nobody
 * signed in → 401; someone not in the viewer's room, oneself, or an unknown id → 404 (one answer); a roommate →
 * 200 with only what colleagueOf gives (answers marked `rekan`); not filled in → 200 with `filled: false`.
 */

const state = vi.hoisted(() => ({
  settings: null as unknown as MainWamSettings, viewer: null as MainWamViewer | null, room: null as ViewerRoom | null,
  profile: null as null | { person: { id: string; name: string; department: string }; card: unknown; answers: { key: string; prompt: string; lines: string[] }[] },
  active: true, demo: false, limited: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/pra-wam/session-token", () => ({ praWamSecret: () => "x".repeat(40) }));
vi.mock("@/lib/server/main-wam/settings", () => ({ readMainWamSettings: async () => state.settings }));
vi.mock("@/lib/server/main-wam/viewer", () => ({ mainWamViewer: async () => state.viewer, testsMainWam: async () => false, viewerRoom: async () => state.room }));
vi.mock("@/lib/server/pra-wam/session", () => ({ currentMember: async () => state.viewer }));
vi.mock("@/lib/server/main-wam/modul/rate", () => ({ limitPerson: async () => { state.limited += 1; } }));
vi.mock("@/lib/server/main-wam/people", () => ({
  mainWamPeople: async () => new Map([
    ["mate-1", { id: "mate-1", name: "Sari Panjang Sekali Namanya", department: "HRGA", photo: "/foto/sari.jpg", active: state.active }],
    ["mate-2", { id: "mate-2", name: "Dewi", department: "CoE", photo: null, active: true }],
    ["outsider", { id: "outsider", name: "Orang Luar", department: "Finance", photo: null, active: true }],
  ]),
}));
vi.mock("@/lib/server/main-wam/demo", () => ({
  demoOn: async () => state.demo,
  demoPlaceFor: () => ({ group: null, room: { id: "r", name: "208", kind: "", floor: "", note: "", people: [{ id: "me", name: "Rani", department: "CoE", me: true }, { id: "demo-1", name: "Sari", department: "HRGA", me: false }, { id: "demo-2", name: "Dewi", department: "CoE", me: false }] } }),
}));
vi.mock("@/lib/server/pra-wam/questionnaire", () => ({ currentForm: async () => ({ id: "form-1" }) }));
vi.mock("@/lib/server/pra-wam/colleagues", () => ({ colleagueOf: async () => state.profile }));

const ORIGIN = "https://journey.test";
const get = (id: string) => import("./route").then(route => route.GET(new Request(`${ORIGIN}/api/wam/acara/kamar/${id}`), { params: Promise.resolve({ id }) }));
const body = async (response: Response) => (await response.json()) as { ok: boolean; data?: { view: { person: { name: string; photo: string | null }; card: { name: string; kind: string; tier: string } | null; answers: { key: string; prompt: string; lines: string[] }[]; filled: boolean } } };

const viewer = (): MainWamViewer => ({ id: "me", name: "Rani", fullName: "Rani Contoh", department: "CoE", photo: null, roles: [], tester: false, group: null, room: null });
const room = (): ViewerRoom => ({ id: "r", name: "208", kind: "Triple", floor: "", note: "", people: [
  { id: "me", name: "Rani", department: "CoE", me: true }, { id: "mate-1", name: "Sari", department: "HRGA", me: false }, { id: "mate-2", name: "Dewi", department: "CoE", me: false },
] });
const card = { figure: null, character: { name: "Penjelajah", class: "Penjelajah", figure: "" }, tier: { name: "Rare" } };
const profile = (answers: { key: string; prompt: string; lines: string[] }[]) => ({ person: { id: "mate-1", name: "Sari", department: "HRGA" }, card, answers });

beforeEach(() => {
  state.settings = { ...defaultSettings(), migrated: true, mode: "semua" };
  state.viewer = viewer(); state.room = room(); state.profile = profile([]); state.active = true; state.demo = false; state.limited = 0;
});

describe("GET /api/wam/acara/kamar/[id]", () => {
  it("asks to sign in first: 401", async () => {
    state.viewer = null;
    expect((await get("mate-1")).status).toBe(401);
  });

  it("is 404 for someone not in my room, for myself and for an unknown id: one answer, nothing leaks", async () => {
    for (const id of ["outsider", "me", "nobody"]) {
      const response = await get(id);
      expect(response.status, id).toBe(404);
      expect(JSON.stringify(await response.json())).not.toMatch(/Orang Luar|Finance/);
    }
  });

  it("is 404 when I have no room yet, and for a roommate who is no longer active", async () => {
    state.room = null;
    expect((await get("mate-1")).status).toBe(404);
    state.room = room(); state.active = false;
    expect((await get("mate-1")).status).toBe(404);
  });

  it("opens a roommate: the head, the card, the answers colleagues may see (the name and department left out, at most 8)", async () => {
    const asked = Array.from({ length: 12 }, (_, index) => ({ key: `k${index}`, prompt: `Tanya ${index}`, lines: [`Jawab ${index}`] }));
    state.profile = profile([{ key: "1", prompt: "Nama", lines: ["Sari"] }, { key: "2", prompt: "Departemen", lines: ["HRGA"] }, ...asked]);
    const response = await get("mate-1");
    expect(response.status).toBe(200);
    const { view } = (await body(response)).data!;
    expect(state.limited).toBe(1);
    expect(view.filled).toBe(true);
    expect(view.person).toMatchObject({ name: "Sari Panjang Sekali Namanya", photo: "/foto/sari.jpg" });
    expect(view.card).toEqual({ name: "Penjelajah", kind: "Penjelajah", tier: "Rare" });
    expect(view.answers.map(answer => answer.key)).toEqual(["k0", "k1", "k2", "k3", "k4", "k5", "k6", "k7"]);
  });

  it("only passes what colleagueOf returns: nothing but key, prompt and lines of an answer, no contact data", async () => {
    state.profile = profile([{ key: "17", prompt: "Hobi?", lines: ["Musik"], value: "rahasia", phone: "0811" } as never]);
    const text = JSON.stringify(await (await get("mate-1")).json());
    expect(text).toContain("Musik");
    expect(text).not.toMatch(/rahasia|0811/);
  });

  it("says they have not filled in when there is no card: 200, filled false, still the head", async () => {
    state.profile = null;
    const response = await get("mate-2");
    expect(response.status).toBe(200);
    const { view } = (await body(response)).data!;
    expect(view).toMatchObject({ filled: false, card: null, answers: [], person: { name: "Dewi" } });
  });

  it("gives sample profiles in Mode demo when there is no real room (the first filled in, the second not)", async () => {
    state.room = null; state.demo = true;
    const first = (await body(await get("demo-1"))).data!.view;
    const second = (await body(await get("demo-2"))).data!.view;
    expect(first.filled).toBe(true);
    expect(first.answers.length).toBeGreaterThan(0);
    expect(first.answers.length).toBeLessThanOrEqual(8);
    expect(second.filled).toBe(false);
    expect((await get("outsider")).status).toBe(404);
  });
});
