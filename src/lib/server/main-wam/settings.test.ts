import { beforeEach, describe, expect, it, vi } from "vitest";

/* Main WAM's settings reader before and after its migration, and the penguji list. */

let row: Record<string, unknown> | null;
let missing = false;
let testers: { employee_id: string }[] = [];
const upserts: Record<string, unknown>[] = [];

vi.mock("../config", () => ({
  isSupabaseConfigured: () => true,
  ServiceError: class ServiceError extends Error { constructor(public status: number, message: string) { super(message); } },
}));
vi.mock("../pra-wam/events", () => ({ listEvents: async () => ({ events: [{ kind: "wam", startDate: "2027-01-04", endDate: "2027-01-07" }], migrated: true }) }));
vi.mock("../supabase/admin", () => ({
  createPrivilegedClient: () => ({
    from: (table: string) => {
      const answer = () => {
        if (missing) return { data: null, error: { code: "42P01", message: `relation "public.${table}" does not exist` } };
        if (table === "mw_testers") return { data: testers, error: null };
        return { data: row, error: null };
      };
      const builder = {
        select: () => builder, eq: () => builder, limit: () => builder, maybeSingle: () => builder,
        upsert: (value: Record<string, unknown>) => { upserts.push(value); row = { ...row, ...value }; return builder; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(answer()).then(resolve),
      };
      return builder;
    },
  }),
}));

const { mainWamSettingsState, readMainWamSettings, saveMainWamSettings, testerIds } = await import("./settings");

beforeEach(() => { row = { mode: "pra" }; missing = false; testers = []; upserts.length = 0; });

describe("Main WAM's settings on the server", () => {
  it("are the defaults (mode pra, Main WAM hidden) before the migration, and cannot be saved then", async () => {
    missing = true;
    const settings = await readMainWamSettings();
    expect(settings).toMatchObject({ mode: "pra", migrated: false });
    expect((await mainWamSettingsState()).migrated).toBe(false);
    await expect(saveMainWamSettings({ mode: "semua" })).rejects.toMatchObject({ status: 503 });
    expect(upserts).toEqual([]);
    expect([...(await testerIds())]).toEqual([]);
  });

  it("read the saved row with the event's dates", async () => {
    row = { mode: "uji", modules: { absen: true } };
    const settings = await mainWamSettingsState();
    expect(settings).toMatchObject({ mode: "uji", migrated: true, event: { startDate: "2027-01-04", endDate: "2027-01-07" } });
    expect(settings.modules.absen).toBe(true);
  });

  it("hide Silent Meeting and voting from the app (readMainWamSettings) whatever the saved switch, while Admin still reads them as saved", async () => {
    row = { mode: "semua", modules: { absen: true, silent: true, voting: true } };
    const shown = await readMainWamSettings();
    expect(shown.modules).toMatchObject({ absen: true, silent: false, voting: false });
    const saved = await mainWamSettingsState();
    expect(saved.modules).toMatchObject({ absen: true, silent: true, voting: true });
  });

  it("save only what changed, on the one row", async () => {
    const saved = await saveMainWamSettings({ mode: "semua", modules: { mozaik: true } });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ id: true, mode: "semua", modules: { mozaik: true, absen: false } });
    expect(saved.mode).toBe("semua");
  });

  it("know the penguji on the list", async () => {
    testers = [{ employee_id: "a" }, { employee_id: "b" }];
    expect([...(await testerIds())]).toEqual(["a", "b"]);
  });
});
