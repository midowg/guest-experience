import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mwMissing } = await import("./errors");

describe("mwMissing", () => {
  it("reads a missing table, column or function as menunggu migrasi", () => {
    for (const code of ["42P01", "PGRST205", "42703", "PGRST204", "42883", "PGRST202"]) expect(mwMissing({ code, message: "x" })).toBe(true);
    expect(mwMissing({ message: 'relation "mw_sessions" does not exist' })).toBe(true);
    // Embedding an mw_ table before its migration (the inbox's mw_notes): Pra WAM's notes plainly, not a 503.
    expect(mwMissing({ code: "PGRST200", message: "Could not find a relationship between 'pw_announcements' and 'mw_notes' in the schema cache" })).toBe(true);
    expect(mwMissing({ code: "PGRST200", message: "Could not find a relationship between 'pw_announcements' and 'employees' in the schema cache" })).toBe(false);
  });

  it("never reads a coded refusal on an mw_ table as a missing migration", () => {
    expect(mwMissing({ code: "23514", message: 'new row for relation "mw_sessions" violates check constraint' })).toBe(false);
    expect(mwMissing({ code: "23505", message: 'duplicate key value violates unique constraint "mw_photos_client_id_key"' })).toBe(false);
    expect(mwMissing({ code: "P0001", message: "mw_award_vote: di luar jendela" })).toBe(false);
    expect(mwMissing({ message: "mw_sessions: something else" })).toBe(false);
    expect(mwMissing(null)).toBe(false);
  });
});
