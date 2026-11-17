import { describe, expect, it } from "vitest";
import { rewardInputSchema, rewardState, voucherActionSchema, voucherGrantSchema } from "@/lib/wellbeing/rules";
import { claimRefusal, toClaim, toReward } from "./rewards-rules";
import { legendFullFor, toVoucher } from "./vouchers";
import { voucherActions } from "@/components/admin/super/RerollVouchers";

/* Voucher re-roll (18 Nov 2026, migration 202611180003): the pure pieces, without a database. */

const PERSON = "11111111-2222-4333-8444-555555555555";

describe("voucher re-roll in Hadiah", () => {
  it("is a prize unless the admin picks a voucher; a voucher needs a card, and Legendary a free place", () => {
    expect(rewardInputSchema.parse({ title: "Tumbler", cost: 10, stock: null, perPerson: 1, active: true }).kind).toBe("barang");
    expect(rewardInputSchema.parse({ title: "Voucher Legendary", cost: 25000, stock: 3, perPerson: 1, active: true, kind: "reroll_legendary" }).kind).toBe("reroll_legendary");
    expect(rewardInputSchema.safeParse({ title: "x y", cost: 1, stock: null, perPerson: 1, active: true, kind: "gacha" }).success).toBe(false);
    const base = { cost: 5000, stock: null, taken: 0, perPerson: 3, mine: 0, available: 9000 };
    expect(rewardState({ ...base, blocked: "no_card" })).toBe("no_card");
    expect(rewardState({ ...base, blocked: "legend_full" })).toBe("legend_full");
    // Over the limit or sold out says so first; short of points only once nothing else blocks.
    expect(rewardState({ ...base, mine: 3, blocked: "no_card" })).toBe("limit");
    expect(rewardState({ ...base, available: 10, blocked: null })).toBe("short");
  });

  it("tells the employee why a voucher cannot be claimed", () => {
    expect(claimRefusal('P0001: reward_no_card')).toEqual({ code: "no_card", message: expect.stringContaining("kuesioner WAM") });
    expect(claimRefusal("reward_legend_full")).toEqual({ code: "legend_full", message: expect.stringContaining("Poinmu tidak terpotong") });
  });

  it("carries the kind to the app, and each voucher claim's ticket", () => {
    const row = { id: "r1", title: "Voucher re-roll", description: "", cost: 5000, stock: null, per_person: 2 };
    expect(toReward(row, [], 0, 0, 10000).kind).toBe("barang");
    expect(toReward({ ...row, kind: "reroll" }, [], 0, 0, 10000, "no_card")).toMatchObject({ kind: "reroll", state: "no_card" });
    const claim = { id: "c1", reward_id: "r1", reward_title: "Voucher re-roll", cost: 5000, status: "delivered", note: "", created_at: "2026-11-18T03:00:00.000Z" };
    expect(toClaim(claim, null).voucher).toBeNull();
    expect(toClaim(claim, null, { legendary: true, status: "open" }).voucher).toEqual({ legendary: true, status: "open" });
  });

  it("counts a Legendary place as taken by other people's Legendary cards and unused Legendary vouchers", () => {
    expect(legendFullFor(3, 2, 0)).toBe(false);
    expect(legendFullFor(3, 2, 1)).toBe(true);
    expect(legendFullFor(3, 3, 0)).toBe(true);
    expect(legendFullFor(null, 50, 9)).toBe(false);
  });
});

describe("super admin's corrections", () => {
  const catalog = {
    figures: [{ key: "ki-hajar", name: "Ki Hajar Dewantara" }, { key: "susi", name: "Susi Susanti" }],
    tiers: [{ key: "rare", name: "Rare" }, { key: "legendary", name: "Legendary" }],
  } as unknown as Parameters<typeof toVoucher>[1];
  const used = {
    id: "t1", employee_id: PERSON, legendary: true, claim_id: "c1", status: "used", note: "", given_by_name: null, created_at: "2026-11-18T03:00:00.000Z", used_at: "2026-11-18T04:00:00.000Z",
    result: { before: { figure_id: "f1", figure_slot: 1, tier_key: "rare", reason: null, combo: "tokoh|f1|1", dna: "abc" }, from: "ki-hajar", to: "susi", fromId: "f1", toId: "f2", tierFrom: "rare", tierTo: "legendary", tierRoll: null },
    person: { full_name: "Dewi Contoh", nickname: "Dewi", department: "Creative" }, claim: { id: "c1", reward_title: "Voucher Legendary", cost: 25000, status: "delivered" },
  };

  it("shows what a used voucher did, and lets the card go back only while it still shows the voucher's figure", () => {
    const voucher = toVoucher(used, catalog, "f2");
    expect(voucher).toMatchObject({ employeeName: "Dewi", before: { figure: "Ki Hajar Dewantara", tier: "Rare" }, after: { figure: "Susi Susanti", tier: "Legendary" }, restorable: true });
    expect(voucherActions(voucher)).toEqual(["refund", "restore"]);
    // Changed since (another re-roll), or put back already: no Kembalikan kartu.
    expect(toVoucher(used, catalog, "f9").restorable).toBe(false);
    expect(toVoucher({ ...used, restored_at: "2026-11-18T05:00:00.000Z" }, catalog, "f2").restorable).toBe(false);
    // Points given back already: only the card is left to correct.
    expect(voucherActions(toVoucher({ ...used, claim: { ...used.claim, status: "rejected" } }, catalog, "f2"))).toEqual(["restore"]);
  });

  it("cancels an unused voucher; a given one has no points to give back", () => {
    const open = toVoucher({ ...used, status: "open", used_at: null, result: null, claim_id: null, claim: null, given_by_name: "Super admin" }, catalog, "f1");
    expect(open).toMatchObject({ claim: null, givenBy: "Super admin", before: null, restorable: false });
    expect(voucherActions(open)).toEqual(["revoke"]);
    expect(voucherActions({ ...open, status: "revoked" })).toEqual([]);
  });

  it("needs a reason the employee reads, except to put a card back", () => {
    expect(voucherActionSchema.safeParse({ action: "revoke", reason: "" }).success).toBe(false);
    expect(voucherActionSchema.safeParse({ action: "refund", reason: "Salah sistem" }).success).toBe(true);
    expect(voucherActionSchema.safeParse({ action: "restore" }).success).toBe(true);
    expect(voucherGrantSchema.parse({ employeeId: PERSON }).legendary).toBe(false);
  });
});
