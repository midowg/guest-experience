import { expect, it, vi } from "vitest";

/*
 * saveGrant before a migration ran (audit F5-02): the apps check of the database refuses an app it
 * does not know yet (23514), and the sentence must name the migration that is really missing. The
 * migrations run in order, so the newest app that was ticked is the one the database does not know.
 */
const answer = vi.hoisted(() => ({ error: { code: "23514", message: 'new row for relation "admin_grants" violates check constraint "admin_grants_apps_check"' } as { code: string; message: string } | null }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("./pra-wam/session", () => ({ loginNameAddress: () => "", signInAddress: () => "" }));
vi.mock("./supabase/admin", () => {
  const table = (name: string) => {
    const builder = {
      select: () => builder, eq: () => builder, upsert: () => builder,
      maybeSingle: async () => ({ data: name === "pw_accounts" ? { active: true } : null, error: null }),
      single: async () => answer.error ? { data: null, error: answer.error } : { data: { employee_id: "e1", apps: ["coffee"], all_events: false, event_ids: [] }, error: null },
    };
    return builder;
  };
  return { createPrivilegedClient: () => ({ from: table }), createPublicClient: () => ({ from: table }) };
});

const { saveGrant } = await import("./admin-actor");
const grant = (apps: string[]) => saveGrant("e1", { apps, allEvents: false, eventIds: [] } as never);

it("names the Coffee migration when Werkudara Coffee is ticked for someone who already holds older access", async () => {
  for (const apps of [["coffee"], ["hr", "coffee"], ["kuesioner", "wellbeing", "wam_acara", "hr", "coffee"], ["acara", "wam", "coffee"]]) {
    await expect(grant(apps), apps.join()).rejects.toMatchObject({ status: 503, message: "Akses Werkudara Coffee menunggu migrasi 202612010001_coffee.sql. Sampai itu, hanya super admin yang bisa membukanya." });
  }
});

it("names the newest missing migration for the older apps, as before", async () => {
  await expect(grant(["kuesioner", "wellbeing", "wam_acara", "hr"])).rejects.toMatchObject({ status: 503, message: expect.stringContaining("202611200703") });
  await expect(grant(["kuesioner", "wellbeing", "wam_acara"])).rejects.toMatchObject({ status: 503, message: expect.stringContaining("202611200603") });
  await expect(grant(["kuesioner", "wellbeing"])).rejects.toMatchObject({ status: 503, message: expect.stringContaining("202611160050") });
  await expect(grant(["kuesioner"])).rejects.toMatchObject({ status: 503, message: expect.stringContaining("202611140001") });
});

it("saves when the database knows the app", async () => {
  answer.error = null;
  await expect(grant(["hr", "coffee"])).resolves.toMatchObject({ employeeId: "e1", apps: ["coffee"] });
});
