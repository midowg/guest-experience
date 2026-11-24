import { beforeEach, describe, expect, it, vi } from "vitest";

/* Which sessions open Misi Perjalanan: the default until set, the admin's choice after, and only for those it is for. */
const fake = vi.hoisted(() => ({ row: null as unknown, mission: true }));
vi.mock("./mission", () => ({ missionFor: async () => (fake.mission ? { role: "HoD" } : null) }));
vi.mock("../supabase/admin", () => ({
  createPrivilegedClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: fake.row === null ? null : { value: fake.row }, error: null }) }) }) }) }),
}));

const { missionSessionsFor } = await import("./mission-sessions");
const { MISSION_SESSION_ID } = await import("@/lib/pra-wam/mission");
const other = "00000000-0000-4000-8000-000000000777";
const member = { id: "m1", name: "Ani" } as never;

beforeEach(() => { fake.row = null; fake.mission = true; });

describe("Misi Perjalanan's sessions", () => {
  it("uses the forum it was built for until the admin sets one", async () => {
    expect([...await missionSessionsFor(member, [MISSION_SESSION_ID, other, null])]).toEqual([MISSION_SESSION_ID]);
  });

  it("follows the admin's choice, and links nothing for someone it is not for", async () => {
    fake.row = { ids: [other] };
    expect([...await missionSessionsFor(member, [MISSION_SESSION_ID, other])]).toEqual([other]);
    fake.mission = false;
    expect([...await missionSessionsFor(member, [other])]).toEqual([]);
    fake.row = { ids: [] };
    fake.mission = true;
    expect([...await missionSessionsFor(member, [MISSION_SESSION_ID, other])]).toEqual([]);
  });
});
