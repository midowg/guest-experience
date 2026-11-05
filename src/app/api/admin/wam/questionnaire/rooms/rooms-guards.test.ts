import { beforeEach, expect, it, vi } from "vitest";

/* Every Kamar route needs the admin session and Data HR open; without them nothing reaches the stay data. */
const state = vi.hoisted(() => ({ admin: true, open: false, calls: [] as string[] }));

vi.mock("@/lib/server/admin-session", async () => {
  const { ServiceError } = await import("@/lib/server/config");
  return { requireApiAdmin: async () => { if (!state.admin) throw new ServiceError(401, "Masuk sebagai admin dulu."); return "admin"; } };
});
vi.mock("@/lib/server/pra-wam/hr-lock", async () => {
  const { ServiceError } = await import("@/lib/server/config");
  return { requireHrUnlocked: async () => { if (!state.open) throw new ServiceError(403, "Data HR terkunci."); return { formId: "f1", expiresAt: "", actor: { id: "hr", name: "HR" } }; } };
});
vi.mock("@/lib/server/pra-wam/stay", () => Object.fromEntries(
  ["addRooms", "updateRoom", "deleteRoom", "placePerson", "suggestPlacements", "clearPlacements", "publishRooms"]
    .map(name => [name, async () => { state.calls.push(name); return name === "suggestPlacements" || name === "addRooms" ? 1 : null; }]),
));

const ROOM = "11111111-1111-4111-8111-111111111111";
const PERSON = "22222222-2222-4222-8222-222222222222";
const send = (method: string, body?: unknown) => new Request("https://journey.test/api/admin/wam/questionnaire/rooms", {
  method, headers: { origin: "https://journey.test", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
});
const params = { params: Promise.resolve({ roomId: ROOM }) };
const routes = async () => {
  const [rooms, room, place, suggest, clear, publish] = await Promise.all([import("./route"), import("./[roomId]/route"), import("./place/route"), import("./suggest/route"), import("./clear/route"), import("./publish/route")]);
  return [
    () => rooms.POST(send("POST", { text: "208, Twin, 2" })),
    () => room.PATCH(send("PATCH", { reviewed: true }), params),
    () => room.DELETE(send("DELETE"), params),
    () => place.PUT(send("PUT", { employeeId: PERSON, roomId: ROOM })),
    () => suggest.POST(send("POST")),
    () => clear.POST(send("POST")),
    () => publish.PUT(send("PUT", { published: true })),
  ];
};

beforeEach(() => { Object.assign(state, { admin: true, open: false, calls: [] }); });

it("refuses every change without Data HR open, and without the admin session", async () => {
  for (const call of await routes()) expect((await call()).status).toBe(403);
  state.admin = false;
  for (const call of await routes()) expect((await call()).status).toBe(401);
  expect(state.calls).toEqual([]);
});

it("goes through with Data HR open", async () => {
  state.open = true;
  for (const call of await routes()) expect((await call()).status).toBe(200);
  expect(state.calls).toEqual(["addRooms", "updateRoom", "deleteRoom", "placePerson", "suggestPlacements", "clearPlacements", "publishRooms"]);
});
