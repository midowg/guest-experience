import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { approvalRefusal } from "@/lib/main-wam/modul/awards";
import { sampleAwards } from "@/lib/main-wam/sample";

/* Admin WAM → Awarding: an admin approves the winner (moved from the BOD screen, 23 Nov 2026). */

vi.mock("server-only", () => ({}));
type Actor = { role: "super" | "admin"; kind: "super" | "shared" | "person"; name: string; employeeId?: string } | null;
const state = vi.hoisted(() => ({ actor: null as unknown, calls: [] as unknown[][] }));
vi.mock("@/lib/server/admin-session", async () => {
  const { ServiceError } = await import("@/lib/server/config");
  return {
    requireApiAdmin: async () => {
      if (!state.actor) throw new ServiceError(401, "Sesi berakhir.");
      if ((state.actor as Actor)?.kind === "person" && (state.actor as { employeeId?: string }).employeeId === "tanpa-akses") throw new ServiceError(403, "Belum diberi akses.");
      return (state.actor as NonNullable<Actor>).role;
    },
    currentAdmin: async () => state.actor,
  };
});
vi.mock("@/lib/server/main-wam/modul/rate", () => ({ limitPerson: async () => undefined }));
vi.mock("@/lib/server/main-wam/modul/awards", async () => {
  const { ServiceError } = await import("@/lib/server/config");
  return {
    approveWinner: async (categoryId: string, nomineeId: string, approver: unknown, now: Date) => {
      state.calls.push([categoryId, nomineeId, approver]);
      const refused = approvalRefusal(sampleAwards.find(item => item.id === categoryId), nomineeId, now);
      if (refused) throw new ServiceError(refused.status, refused.message);
      return { categoryId, nomineeId, approvedBy: (approver as { id: string | null }).id, approvedAt: now.toISOString() };
    },
  };
});

const route = await import("./route");
const voting = sampleAwards[0], juri = sampleAwards[2];
const post = (id: string, body: unknown) => route.POST(new Request(`https://journey.example/api/admin/wam2026/awarding/${id}/setujui`, {
  method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", Origin: "https://journey.example" },
}), { params: Promise.resolve({ id }) });

beforeEach(() => { state.actor = { role: "super", kind: "super", name: "Super admin" }; state.calls = []; vi.useFakeTimers(); vi.setSystemTime(new Date("2027-01-06T16:00:00+07:00")); });
afterEach(() => vi.useRealTimers());

describe("POST /api/admin/wam2026/awarding/[id]/setujui", () => {
  it("is refused without a session (401) or without access to this part (403)", async () => {
    state.actor = null;
    expect((await post(voting.id, { nomineeId: voting.nominees[0].id })).status).toBe(401);
    state.actor = { role: "admin", kind: "person", name: "Tamu", employeeId: "tanpa-akses" };
    expect((await post(voting.id, { nomineeId: voting.nominees[0].id })).status).toBe(403);
    expect(state.calls).toEqual([]);
  });

  it("answers 422 to a wrong body or category id", async () => {
    expect((await post(voting.id, {})).status).toBe(422);
    expect((await post(voting.id, { nomineeId: "bukan-uuid" })).status).toBe(422);
    expect((await post(voting.id, { nomineeId: voting.nominees[0].id, extra: 1 })).status).toBe(422);
    expect((await post("bukan-uuid", { nomineeId: voting.nominees[0].id })).status).toBe(422);
    expect(state.calls).toEqual([]);
  });

  it("approves as the super admin: no employee id, named in the note", async () => {
    const response = await post(voting.id, { nomineeId: voting.nominees[0].id });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { nomineeId: voting.nominees[0].id, approvedBy: null } });
    expect(state.calls[0][2]).toEqual({ id: null, name: "Super admin" });
  });

  it("records a personal admin by employee id and name; the shared password has none", async () => {
    state.actor = { role: "admin", kind: "person", name: "Wulan Contoh", employeeId: "11111111-1111-4111-8111-111111111111" };
    expect(((await (await post(juri.id, { nomineeId: juri.nominees[0].id })).json()) as { data: { approvedBy: string } }).data.approvedBy).toBe("11111111-1111-4111-8111-111111111111");
    expect(state.calls[0][2]).toEqual({ id: "11111111-1111-4111-8111-111111111111", name: "Wulan Contoh" });
    state.actor = { role: "admin", kind: "shared", name: "Admin" };
    await post(juri.id, { nomineeId: juri.nominees[0].id });
    expect(state.calls[1][2]).toEqual({ id: null, name: "Admin" });
  });

  it("keeps the approval rules: voting not closed yet is 409, an unknown nominee 422", async () => {
    vi.setSystemTime(new Date("2027-01-06T10:00:00+07:00"));
    expect((await post(voting.id, { nomineeId: voting.nominees[0].id })).status).toBe(409);
    vi.setSystemTime(new Date("2027-01-06T16:00:00+07:00"));
    expect((await post(voting.id, { nomineeId: juri.nominees[0].id })).status).toBe(422);
    // A jury category may be approved any time.
    vi.setSystemTime(new Date("2027-01-04T09:00:00+07:00"));
    expect((await post(juri.id, { nomineeId: juri.nominees[0].id })).status).toBe(200);
  });
});
