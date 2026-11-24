import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceError } from "@/lib/server/config";

/* GET momen/ditandai: behind the same gate as the other Momen routes, and a cursor that is not ours is a 422. */

let gate: "ok" | 401 | 404 = "ok";
const context = { viewer: { id: "11111111-1111-4111-8111-111111111111", roles: [], group: null } };
vi.mock("@/lib/server/main-wam/gate", () => ({
  requireMainWamApi: async () => { if (gate !== "ok") throw new ServiceError(gate, "Tidak bisa."); return context; },
}));
const asked: unknown[] = [];
vi.mock("@/lib/server/main-wam/momen/tagged", () => ({ listTagged: async (_context: unknown, input: unknown) => { asked.push(input); return { items: [], next: null, total: 0, migrated: true }; } }));

const { GET } = await import("./route");
const get = (query = "") => GET(new Request(`http://localhost:3100/api/wam/acara/momen/ditandai${query}`));
beforeEach(() => { gate = "ok"; asked.length = 0; });

describe("GET /api/wam/acara/momen/ditandai", () => {
  it("is refused without a session (401) or when Main WAM is not on for the person (404)", async () => {
    for (const status of [401, 404] as const) { gate = status; expect((await get()).status).toBe(status); }
    expect(asked).toHaveLength(0);
  });

  it("answers the first page without a cursor, and the next with one", async () => {
    expect((await get()).status).toBe(200);
    expect(asked[0]).toEqual({ cursor: null });
    await get("?sebelum=t~2027-01-05T08%3A00%3A00.000Z~00000000-0000-4000-8c00-000000000001");
    expect(asked[1]).toEqual({ cursor: { at: "2027-01-05T08:00:00.000Z", id: "00000000-0000-4000-8c00-000000000001" } });
  });

  it("422 for a cursor that is not a Ditandai cursor", async () => {
    expect((await get("?sebelum=b~")).status).toBe(422);
    expect((await get("?sebelum=t~oops~x")).status).toBe(422);
    expect(asked).toHaveLength(0);
  });
});
