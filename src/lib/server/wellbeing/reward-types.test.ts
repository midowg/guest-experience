import { describe, expect, it } from "vitest";
import { autoAllowed, categoryOf, codeLines, isAppVoucher, isLinkCode, rewardEnded, rewardInputSchema, rewardShape, voucherTypeOf } from "@/lib/wellbeing/rules";
import { claimRefusal, toAdminClaim, toClaim, toReward } from "./rewards-rules";

/* Jenis hadiah dan voucher kode (18 Nov 2026, migration 202611180004): the pure pieces, without a database. */

const base = { title: "Voucher kopi", cost: 5000, stock: null, perPerson: 1, active: true };

describe("reward kinds and code vouchers", () => {
  it("files every kind under Barang, Uang, Voucher or Lainnya (a re-roll is an app voucher)", () => {
    expect(voucherTypeOf("voucher")).toBe("kode");
    expect(voucherTypeOf("reroll")).toBe("aplikasi");
    expect(voucherTypeOf("barang")).toBeNull();
    expect(isAppVoucher("reroll_legendary")).toBe(true);
    expect(isAppVoucher("voucher")).toBe(false);
    expect(categoryOf("barang")).toBe("barang");
    expect(categoryOf("uang")).toBe("uang");
    expect(categoryOf("lainnya")).toBe("lainnya");
    expect(categoryOf("voucher")).toBe("voucher");
    expect(categoryOf("reroll_legendary")).toBe("voucher");
  });

  it("asks a code voucher where its codes come from, and the code when it is one for everyone", () => {
    expect(rewardInputSchema.safeParse({ ...base, kind: "voucher" }).success).toBe(false);
    expect(rewardInputSchema.safeParse({ ...base, kind: "voucher", codeMode: "shared" }).success).toBe(false);
    expect(rewardInputSchema.parse({ ...base, kind: "voucher", codeMode: "shared", sharedCode: "  WLM2026 " }).sharedCode).toBe("WLM2026");
    expect(rewardInputSchema.parse({ ...base, kind: "uang" })).toMatchObject({ kind: "uang", delivery: "admin", codeMode: null, addCodes: [] });
  });

  it("hands over at once only what needs nobody: a code that is ready, or an app voucher", () => {
    expect(autoAllowed("voucher", "pool")).toBe(true);
    expect(autoAllowed("voucher", "shared")).toBe(true);
    expect(autoAllowed("voucher", "manual")).toBe(false);
    expect(autoAllowed("barang", null)).toBe(false);
    expect(autoAllowed("reroll", null)).toBe(true);
    expect(rewardInputSchema.safeParse({ ...base, kind: "barang", delivery: "auto" }).success).toBe(false);
    expect(rewardInputSchema.safeParse({ ...base, kind: "voucher", codeMode: "manual", delivery: "auto" }).success).toBe(false);
    expect(rewardInputSchema.safeParse({ ...base, kind: "voucher", codeMode: "pool", delivery: "auto" }).success).toBe(true);
    expect(rewardInputSchema.safeParse({ ...base, kind: "uang", delivery: "approved" }).success).toBe(true);
  });

  it("stores only what a kind uses: no stock for unique codes, no voucher fields on a prize; a re-roll's delivery as chosen", () => {
    const input = { delivery: "admin" as const, codeMode: "pool" as const, sharedCode: "X", validUntil: "2026-12-31", howTo: "Di kasir", stock: 5 };
    expect(rewardShape({ ...input, kind: "voucher" })).toEqual({ delivery: "admin", codeMode: "pool", sharedCode: null, validUntil: "2026-12-31", howTo: "Di kasir", stock: null });
    expect(rewardShape({ ...input, kind: "voucher", codeMode: "shared" })).toMatchObject({ codeMode: "shared", sharedCode: "X", stock: 5 });
    expect(rewardShape({ ...input, kind: "barang" })).toEqual({ delivery: "admin", codeMode: null, sharedCode: null, validUntil: null, howTo: "", stock: 5 });
    expect(rewardShape({ ...input, kind: "reroll" }).delivery).toBe("admin");
    expect(rewardShape({ ...input, kind: "reroll", delivery: "auto" }).delivery).toBe("auto");
    expect(rewardShape({ ...input, kind: "barang", delivery: "auto" }).delivery).toBe("admin");
    expect(rewardInputSchema.safeParse({ ...base, kind: "reroll", delivery: "admin" }).success).toBe(true);
  });

  it("reads pasted codes one per line, a web address as a link, and a voucher's last day in WIB", () => {
    expect(codeLines("A-1\r\n  B-2 \n\nA-1\n")).toEqual(["A-1", "B-2"]);
    expect(isLinkCode("https://toko.example/promo")).toBe(true);
    expect(isLinkCode(" http://a.example ")).toBe(true);
    expect(isLinkCode("javascript:alert(1)")).toBe(false);
    expect(isLinkCode("KOPI-8H2K")).toBe(false);
    expect(rewardEnded("2026-11-17", "2026-11-18")).toBe(true);
    expect(rewardEnded("2026-11-18", "2026-11-18")).toBe(false);
    expect(rewardEnded(null, "2026-11-18")).toBe(false);
    expect(claimRefusal("P0001: reward_expired")).toEqual({ code: "expired", message: expect.stringContaining("berlaku") });
  });

  it("counts what is left of unique codes from the codes not given yet, whatever the stock says", () => {
    const row = { id: "r1", title: "Voucher kopi", description: "", cost: 5000, stock: 50, per_person: 2, kind: "voucher", delivery: "auto", code_mode: "pool", valid_until: "2026-12-31", how_to: "Di kasir" };
    expect(toReward(row, [], 3, 0, 10000, null, 2)).toMatchObject({ left: 2, state: "available", delivery: "auto", validUntil: "2026-12-31", howTo: "Di kasir" });
    expect(toReward(row, [], 3, 0, 10000, null, 0)).toMatchObject({ left: 0, state: "sold_out" });
    // Before the migration: a prize waits for the admin, a re-roll is at once.
    expect(toReward({ ...row, kind: undefined, delivery: undefined }, [], 0, 0, 10000).delivery).toBe("admin");
    expect(toReward({ ...row, kind: "reroll", delivery: undefined }, [], 0, 0, 10000).delivery).toBe("auto");
  });

  it("shows a claim's code only once handed over, and tells the admin when to type one in", () => {
    const claim = { id: "c1", reward_id: "r1", reward_title: "Voucher kopi", cost: 5000, status: "requested", note: "", created_at: "2026-11-18T03:00:00.000Z", code: "KOPI-1" };
    const reward = { kind: "voucher" as const, codeMode: "pool" as const, validUntil: "2026-12-31", howTo: "Di kasir" };
    expect(toClaim(claim, null, null, reward)).toMatchObject({ code: null, kind: "voucher", validUntil: "2026-12-31", howTo: "Di kasir" });
    expect(toClaim({ ...claim, status: "delivered" }, null, null, reward).code).toBe("KOPI-1");
    expect(toAdminClaim(claim, null, reward)).toMatchObject({ code: "KOPI-1", needsCode: false });
    expect(toAdminClaim({ ...claim, code: null }, null, { ...reward, codeMode: "manual" }).needsCode).toBe(true);
    expect(toAdminClaim({ ...claim, code: "PULSA-9" }, null, { ...reward, codeMode: "manual" }).needsCode).toBe(false);
  });
});
