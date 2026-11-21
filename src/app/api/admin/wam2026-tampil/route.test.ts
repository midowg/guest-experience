import { beforeEach, describe, expect, it, vi } from "vitest";

/* Main WAM shown or hidden in Journey: only the super admin switches it, and who did it is kept. */

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ role: "admin" as "admin" | "super" | null, saved: [] as [boolean, string][] }));
vi.mock("@/lib/server/admin-session", async () => {
  const { ServiceError } = await import("@/lib/server/config");
  return {
    requireSuperAdmin: async () => {
      if (!state.role) throw new ServiceError(401, "Sesi berakhir.");
      if (state.role !== "super") throw new ServiceError(403, "Hanya super admin yang dapat melakukan ini.");
    },
    currentAdmin: async () => (state.role === "super" ? { kind: "super", role: "super", name: "Super admin" } : null),
  };
});
vi.mock("@/lib/server/main-wam-visibility", () => ({
  getMainWamVisibility: async () => ({ shown: false, migrated: true, changedAt: null, changedBy: null }),
  setMainWamShown: async (shown: boolean, by: string) => { state.saved.push([shown, by]); return { shown, migrated: true, changedAt: "2026-11-20T10:00:00Z", changedBy: by }; },
}));

const route = await import("./route");
const put = (body: unknown) => new Request("https://journey.example/api/admin/wam2026-tampil", {
  method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json", Origin: "https://journey.example" },
});

beforeEach(() => { state.role = "admin"; state.saved = []; });

describe("PUT /api/admin/wam2026-tampil", () => {
  it("is refused for an admin who is not the super admin, and for nobody signed in", async () => {
    expect((await route.PUT(put({ shown: true }))).status).toBe(403);
    expect((await route.GET()).status).toBe(403);
    state.role = null;
    expect((await route.PUT(put({ shown: true }))).status).toBe(401);
    expect(state.saved).toEqual([]);
  });

  it("lets the super admin show and hide Main WAM, recording who", async () => {
    state.role = "super";
    const shown = await route.PUT(put({ shown: true }));
    expect(shown.status).toBe(200);
    expect(await shown.json()).toMatchObject({ ok: true, data: { shown: true, changedBy: "Super admin" }, message: "WAM 2026 ditampilkan di aplikasi." });
    expect((await route.PUT(put({ shown: false }))).status).toBe(200);
    expect(state.saved).toEqual([[true, "Super admin"], [false, "Super admin"]]);
  });

  it("takes only { shown: boolean }", async () => {
    state.role = "super";
    expect((await route.PUT(put({ shown: "ya" }))).status).toBe(422);
    expect((await route.PUT(put({ shown: true, extra: 1 }))).status).toBe(422);
    expect(state.saved).toEqual([]);
  });
});
