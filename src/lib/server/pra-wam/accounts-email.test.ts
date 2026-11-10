import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * updateEmail against a small stand-in for the Supabase client: Data karyawan rows, the
 * pw_accounts link and the Auth users, so the sign-in follows the email whichever page saves it.
 */
type Row = { id: string; email: string | null };
let people: Row[];
let accounts: Record<string, string>;
let signIns: Record<string, string>;
let failSave: boolean;

function query(table: string) {
  let employeeId = "";
  let patch: Record<string, unknown> | null = null;
  const builder = {
    select: () => builder, limit: () => builder,
    update: (values: Record<string, unknown>) => { patch = values; return builder; },
    eq: (_column: string, value: string) => {
      employeeId = value;
      if (patch) {
        if (failSave) return Promise.resolve({ error: { code: "XX000", message: "gagal" } });
        const person = people.find(row => row.id === value);
        if (person) person.email = patch.email as string;
        return Promise.resolve({ error: null });
      }
      return builder;
    },
    maybeSingle: async () => ({ data: accounts[employeeId] ? { auth_user_id: accounts[employeeId] } : null, error: null }),
    then: (resolve: (answer: unknown) => unknown) => Promise.resolve({ data: table === "employees" ? people : [], error: null }).then(resolve),
  };
  return builder;
}
const auth = {
  admin: {
    getUserById: vi.fn(async (id: string) => ({ data: { user: signIns[id] ? { id, email: signIns[id] } : null }, error: null })),
    updateUserById: vi.fn(async (id: string, { email }: { email: string }) => {
      if (Object.entries(signIns).some(([other, address]) => other !== id && address === email)) return { data: null, error: { message: "A user with this email address has already been registered" } };
      signIns[id] = email;
      return { data: {}, error: null };
    }),
  },
};
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: query, auth }) }));
vi.mock("./leads", () => ({ listLeads: async () => ({ byPerson: new Map(), migrated: true }), leadsOf: async () => ({ departments: [], lead: false }) }));

const { updateEmail } = await import("./accounts");

beforeEach(() => {
  vi.clearAllMocks();
  failSave = false;
  people = [{ id: "e1", email: "satu@werkudara.com" }, { id: "e2", email: "dua@werkudara.com" }, { id: "e3", email: null }];
  accounts = { e1: "auth-1", e2: "auth-2" };
  signIns = { "auth-1": "satu@werkudara.com", "auth-2": "dua@werkudara.com" };
});

describe("updateEmail", () => {
  it("moves the sign-in to an address on another domain together with Data karyawan", async () => {
    await updateEmail("e1", " Satu.Baru@Gmail.com ");
    expect(signIns["auth-1"]).toBe("satu.baru@gmail.com");
    expect(people[0].email).toBe("satu.baru@gmail.com");
  });

  it("mends a sign-in left on an older address when the same email is saved again", async () => {
    people[0].email = "satu@contoh.co.id";
    await updateEmail("e1", "satu@contoh.co.id");
    expect(signIns["auth-1"]).toBe("satu@contoh.co.id");
  });

  it("writes nothing when both already match", async () => {
    await updateEmail("e1", "SATU@werkudara.com");
    expect(auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it("refuses an address another person uses, and changes nothing", async () => {
    await expect(updateEmail("e1", "dua@werkudara.com")).rejects.toMatchObject({ status: 409 });
    expect(signIns["auth-1"]).toBe("satu@werkudara.com");
    expect(people[0].email).toBe("satu@werkudara.com");
  });

  it("refuses to empty the email of someone with an account, but not of someone without", async () => {
    await expect(updateEmail("e1", "")).rejects.toMatchObject({ status: 422 });
    await updateEmail("e3", "tiga@contoh.com");
    expect(people[2].email).toBe("tiga@contoh.com");
    expect(auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it("puts the sign-in back when Data karyawan cannot be saved", async () => {
    failSave = true;
    await expect(updateEmail("e1", "satu@lain.com")).rejects.toBeTruthy();
    expect(signIns["auth-1"]).toBe("satu@werkudara.com");
  });
});
