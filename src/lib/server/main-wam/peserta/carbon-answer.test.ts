import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../supabase/admin", () => ({ createPrivilegedClient: () => ({}) }));

import { carbonAnswerRowKey } from "./carbon-answer";

/* Where a person's answer is kept: a pw_settings row of their own, keyed so that no name or id shows and it never meets Pra WAM's rows. */

describe("the row of a person's answer", () => {
  it("fits pw_settings' key rule, is stable, and differs per person", () => {
    const id = "6b1c9c2e-0000-4000-8000-000000000001";
    expect(carbonAnswerRowKey(id)).toMatch(/^mwc_[0-9a-f]{32}$/);
    expect(carbonAnswerRowKey(id)).toMatch(/^[a-z0-9_]{2,40}$/);
    expect(carbonAnswerRowKey(id)).toBe(carbonAnswerRowKey(id));
    expect(carbonAnswerRowKey(id)).not.toBe(carbonAnswerRowKey("6b1c9c2e-0000-4000-8000-000000000002"));
    expect(carbonAnswerRowKey(id)).not.toContain(id.slice(0, 8));
  });

  it("never collides with Pra WAM's carbon_ rows", () => {
    expect(carbonAnswerRowKey("x").startsWith("carbon_")).toBe(false);
  });
});
