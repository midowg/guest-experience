import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * WLM Strava (18 Nov 2026) against a small in-memory stand-in for the tables and Strava itself. The
 * people and activities are made up.
 */
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;

function query(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let op: "select" | "update" | "insert" | "upsert" | "delete" = "select";
  let payload: Row = {};
  let returning = false, single = false;
  const run = () => {
    const rows = tables[table] ?? (tables[table] = []);
    if (op === "insert") {
      if (rows.some(row => row.source === payload.source && row.external_id === payload.external_id)) return { data: null, error: { code: "23505", message: "duplicate" } };
      rows.push({ id: `act-${rows.length + 1}`, ...payload });
      return { data: null, error: null };
    }
    if (op === "upsert") {
      if (rows.some(row => row.athlete_id === payload.athlete_id && row.employee_id !== payload.employee_id)) return { data: null, error: { code: "23505", message: "duplicate" } };
      const at = rows.findIndex(row => row.employee_id === payload.employee_id);
      if (at >= 0) rows[at] = { ...rows[at], ...payload }; else rows.push({ ...payload });
      return { data: null, error: null };
    }
    const hit = rows.filter(row => filters.every(filter => filter(row)));
    if (op === "update") { hit.forEach(row => Object.assign(row, payload)); return { data: returning ? hit.map(row => ({ ...row })) : null, error: null }; }
    if (op === "delete") { tables[table] = rows.filter(row => !hit.includes(row)); return { data: null, error: null }; }
    return { data: single ? hit[0] ?? null : hit.map(row => ({ ...row })), error: null };
  };
  const builder = {
    select: () => { returning = true; return builder; },
    eq: (column: string, value: unknown) => { filters.push(row => row[column] === value); return builder; },
    in: (column: string, values: unknown[]) => { filters.push(row => values.includes(row[column])); return builder; },
    or: (expression: string) => { const until = expression.split("lt.")[1]; filters.push(row => row.refreshing_until == null || String(row.refreshing_until) < until); return builder; },
    update: (values: Row) => { op = "update"; payload = values; return builder; },
    insert: (values: Row) => { op = "insert"; payload = values; return builder; },
    upsert: (values: Row) => { op = "upsert"; payload = values; return builder; },
    delete: () => { op = "delete"; return builder; },
    maybeSingle: () => { single = true; return builder; },
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
  };
  return builder;
}
vi.mock("./shared", () => ({
  db: () => ({ from: (table: string) => query(table) }),
  missing: () => false,
  readSettings: async () => ({ migrated: true, settings: { backdateDays: 7, maxKcal: 3000, maxSteps: 30000 }, app: {} }),
  withTimeColumn: (run: (on: boolean) => unknown) => run(true),
}));

// Strava: tokens, the athlete's activities, and each activity's detail (with calories).
type Activity = { id: number; name: string; sport_type: string; start_date_local: string; moving_time: number; calories: number };
let strava: { activities: Activity[]; refreshFails: number | null; calls: string[] };
const answer = (status: number, body?: unknown) => new Response(body === undefined ? "" : JSON.stringify(body), { status });
const fakeFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  strava.calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
  if (url.pathname === "/oauth/token") {
    const body = new URLSearchParams(String(init?.body));
    if (body.get("grant_type") === "refresh_token" && strava.refreshFails) return answer(strava.refreshFails, { message: "Bad Request" });
    return answer(200, { access_token: `access-${strava.calls.length}`, refresh_token: `refresh-${strava.calls.length}`, expires_at: Math.floor(Date.now() / 1000) + 6 * 3600, scope: "read,activity:read_all", athlete: { id: 777, firstname: "Dewi", lastname: "C." } });
  }
  if (url.pathname === "/oauth/revoke") return answer(200);
  if (url.pathname === "/api/v3/athlete/activities") return answer(200, url.searchParams.get("page") === "1" ? strava.activities.map(item => ({ id: item.id })) : []);
  const detail = /^\/api\/v3\/activities\/(\d+)$/.exec(url.pathname);
  if (detail) { const found = strava.activities.find(item => item.id === Number(detail[1])); return found ? answer(200, found) : answer(404, { message: "Not Found" }); }
  return answer(404);
});

const ME = { id: "11111111-1111-4111-8111-111111111111" };
const OTHER = { id: "22222222-2222-4222-8222-222222222222" };
const sports = () => [{ code: "sport.running", dimension_id: "physical", active: true, kind: "sport" }, { code: "sport.cycling", dimension_id: "physical", active: true, kind: "sport" }, { code: "sport.other", dimension_id: "physical", active: true, kind: "sport" }];

const saved = { env: { ...process.env }, fetch: globalThis.fetch };
beforeAll(() => {
  process.env.STRAVA_CLIENT_ID = "12345";
  process.env.STRAVA_CLIENT_SECRET = "client-secret-for-tests";
  process.env.WAM_SESSION_SECRET = "a-test-session-secret-of-enough-length-000";
  globalThis.fetch = fakeFetch as unknown as typeof fetch;
});
afterAll(() => { process.env = saved.env; globalThis.fetch = saved.fetch; });
beforeEach(() => {
  tables = { wb_strava_links: [], wb_activities: [], wb_activity_types: sports() };
  strava = { activities: [], refreshFails: null, calls: [] };
  fakeFetch.mockClear();
});

const load = () => import("./strava");
async function connected(employee = ME) {
  const wlm = await load();
  await wlm.connectStrava(employee, { code: "code-1", scope: "read,activity:read_all", state: wlm.stateFor(employee.id) });
  return wlm;
}

describe("secrets", () => {
  it("stores tokens encrypted, and refuses a changed one", async () => {
    const { seal, unseal } = await load();
    const once = seal("token-abc"), twice = seal("token-abc");
    expect(once).not.toContain("token-abc");
    expect(once).not.toBe(twice);
    expect(unseal(once)).toBe("token-abc");
    const parts = once.split(".");
    expect(() => unseal([...parts.slice(0, 3), parts[3].slice(0, -2) + "AA"].join("."))).toThrow();
  });

  it("signs the connection state for one person and a short while", async () => {
    const { stateFor, stateOwner } = await load();
    const state = stateFor(ME.id, 1_000_000);
    expect(stateOwner(state, 1_000_000)).toBe(ME.id);
    expect(stateOwner(state, 1_000_000 + 16 * 60_000)).toBeNull();
    expect(stateOwner(state.replace(ME.id, OTHER.id), 1_000_000)).toBeNull();
    expect(stateOwner("nonsense")).toBeNull();
  });
});

describe("connecting", () => {
  it("keeps the link (tokens encrypted), one Strava account per employee", async () => {
    const wlm = await connected();
    const [link] = tables.wb_strava_links;
    expect(link).toMatchObject({ employee_id: ME.id, athlete_id: 777, athlete_name: "Dewi C.", status: "ok" });
    expect(String(link.access_token)).not.toContain("access-");
    expect(await wlm.stravaStatus(ME)).toMatchObject({ ready: true, connected: true, status: "ok", athleteName: "Dewi C.", private: true });
    // The same Strava account for someone else: refused, and the first link stays.
    await expect(wlm.connectStrava(OTHER, { code: "code-2", scope: "read,activity:read_all", state: wlm.stateFor(OTHER.id) })).rejects.toMatchObject({ problem: "dipakai" });
    expect(tables.wb_strava_links).toHaveLength(1);
  });

  it("refuses a stale or someone else's state, and a missing activity permission", async () => {
    const wlm = await load();
    await expect(wlm.connectStrava(ME, { code: "c", scope: "read,activity:read_all", state: wlm.stateFor(OTHER.id) })).rejects.toMatchObject({ problem: "kedaluwarsa" });
    await expect(wlm.connectStrava(ME, { code: "c", scope: "read", state: wlm.stateFor(ME.id) })).rejects.toMatchObject({ problem: "izin" });
    expect(tables.wb_strava_links).toHaveLength(0);
  });

  it("disconnects: Strava forgets WLM, counted activities stay", async () => {
    const wlm = await connected();
    tables.wb_activities.push({ id: "kept", employee_id: ME.id, source: "strava", external_id: "1", status: "approved" });
    await wlm.disconnectStrava(ME);
    expect(strava.calls).toContain("POST /oauth/revoke");
    expect(tables.wb_strava_links).toHaveLength(0);
    expect(tables.wb_activities).toHaveLength(1);
  });
});

describe("activities", () => {
  const run = (id: number, calories: number, sport = "Run"): Activity => ({ id, name: `Lari ${id}`, sport_type: sport, start_date_local: "2026-11-18T06:05:00Z", moving_time: 1800, calories });

  it("reads the month's new activities once each: points = calories, sport mapped", async () => {
    const wlm = await connected();
    strava.activities = [run(101, 412), run(102, 250, "GravelRide")];
    tables.wb_activities.push({ id: "old", employee_id: ME.id, source: "strava", external_id: "101", status: "approved", points: 412, checked: true });
    const result = await wlm.syncStrava(ME.id, new Date("2026-11-18T05:00:00Z"));
    expect(result).toEqual({ added: 1, seen: 2 });
    // Only the new one's detail was read.
    expect(strava.calls.filter(call => call.startsWith("GET /api/v3/activities/"))).toEqual(["GET /api/v3/activities/102"]);
    expect(tables.wb_activities.find(row => row.external_id === "102")).toMatchObject({
      employee_id: ME.id, type_code: "sport.cycling", source: "strava", happened_on: "2026-11-18", happened_time: "06:05", kcal: 250, minutes: 30, points: 250, points_claimed: 250, status: "approved", checked: false,
    });
    expect(tables.wb_strava_links[0].last_sync_at).toBeTruthy();
  });

  it("never overwrites an admin's decision; changed points send a checked one back to Belum diperiksa", async () => {
    const wlm = await connected();
    strava.activities = [run(201, 500), run(202, 600)];
    tables.wb_activities.push(
      { id: "a", employee_id: ME.id, source: "strava", external_id: "201", status: "rejected", points: 0, points_claimed: 450, checked: true, review_reason: "Bukan olahraga" },
      { id: "b", employee_id: ME.id, source: "strava", external_id: "202", status: "approved", points: 550, points_claimed: 550, checked: true },
    );
    await wlm.handleStravaEvent({ object_type: "activity", aspect_type: "update", object_id: 201, owner_id: 777 });
    await wlm.handleStravaEvent({ object_type: "activity", aspect_type: "update", object_id: 202, owner_id: 777 });
    expect(tables.wb_activities.find(row => row.id === "a")).toMatchObject({ status: "rejected", points: 0, points_claimed: 500, checked: true });
    expect(tables.wb_activities.find(row => row.id === "b")).toMatchObject({ status: "approved", points: 600, checked: false });
  });

  it("deletes only what Strava says is gone (a made-up delete event changes nothing)", async () => {
    const wlm = await connected();
    strava.activities = [run(301, 300)];
    tables.wb_activities.push(
      { id: "here", employee_id: ME.id, source: "strava", external_id: "301", status: "approved", points: 300 },
      { id: "gone", employee_id: ME.id, source: "strava", external_id: "302", status: "approved", points: 200 },
    );
    await wlm.handleStravaEvent({ object_type: "activity", aspect_type: "delete", object_id: 301, owner_id: 777 });
    await wlm.handleStravaEvent({ object_type: "activity", aspect_type: "delete", object_id: 302, owner_id: 777 });
    expect(tables.wb_activities.map(row => row.id)).toEqual(["here"]);
    // Someone not connected: ignored.
    await wlm.handleStravaEvent({ object_type: "activity", aspect_type: "create", object_id: 301, owner_id: 999 });
    expect(tables.wb_activities).toHaveLength(1);
  });
});

describe("tokens", () => {
  it("refreshes an expired token and keeps the new refresh token", async () => {
    const wlm = await connected();
    const before = tables.wb_strava_links[0].refresh_token;
    tables.wb_strava_links[0].expires_at = new Date(Date.now() - 60_000).toISOString();
    await wlm.syncStrava(ME.id);
    expect(strava.calls.filter(call => call === "POST /oauth/token")).toHaveLength(2);
    expect(tables.wb_strava_links[0].refresh_token).not.toBe(before);
    expect(tables.wb_strava_links[0]).toMatchObject({ status: "ok", refreshing_until: null });
  });

  it("says Sambungkan ulang when Strava refuses the refresh, and a removal only when the tokens really stop", async () => {
    const wlm = await connected();
    // Access removed on Strava, but the tokens still work: a made-up event, the link stays.
    await wlm.handleStravaEvent({ object_type: "athlete", aspect_type: "update", object_id: 777, owner_id: 777, updates: { authorized: "false" } });
    expect(tables.wb_strava_links).toHaveLength(1);
    strava.refreshFails = 400;
    tables.wb_strava_links[0].expires_at = new Date(Date.now() - 60_000).toISOString();
    await expect(wlm.syncStrava(ME.id)).rejects.toMatchObject({ status: 409 });
    expect(tables.wb_strava_links[0]).toMatchObject({ status: "reconnect" });
    expect((await wlm.stravaStatus(ME)).status).toBe("reconnect");
    // Now really removed: the link goes.
    await wlm.handleStravaEvent({ object_type: "athlete", aspect_type: "update", object_id: 777, owner_id: 777, updates: { authorized: "false" } });
    expect(tables.wb_strava_links).toHaveLength(0);
  });
});

describe("webhook check", () => {
  it("echoes Strava's challenge only with our token", async () => {
    const { GET } = await import("@/app/api/wellbeing/strava/webhook/route");
    const { webhookToken } = await load();
    const ok = await GET(new Request(`https://journey.example/api/wellbeing/strava/webhook?hub.mode=subscribe&hub.challenge=abc123&hub.verify_token=${webhookToken()}`));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ "hub.challenge": "abc123" });
    const wrong = await GET(new Request("https://journey.example/api/wellbeing/strava/webhook?hub.mode=subscribe&hub.challenge=abc123&hub.verify_token=guess"));
    expect(wrong.status).toBe(403);
  });
});
