import { describe, expect, it } from "vitest";
import { claimActionFrom, claimDecisionSchema, claimRequestSchema, rewardInputSchema, rewardState, saldoOf } from "@/lib/wellbeing/rules";
import { claimCounts, claimRefusal, isRewardPhotoKey, rewardPhotoKey, saldoFrom, toAdminClaim, toClaim, toReward } from "./rewards-rules";

/* Hadiah (18 Nov 2026): the saldo, what a reward is for me, claims, and reward photo keys. */

const ID = "0b9f3f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

describe("saldo", () => {
  it("holds requested, approved and handed-over claims; rejected and cancelled ones give the points back", () => {
    const claims = [
      { status: "requested" as const, cost: 400 }, { status: "approved" as const, cost: 100 }, { status: "delivered" as const, cost: 50 },
      { status: "rejected" as const, cost: 9000 }, { status: "cancelled" as const, cost: 9000 },
    ];
    expect(saldoFrom(1000, claims)).toEqual({ earned: 1000, held: 550, available: 450 });
    expect(saldoOf(1000, claims)).toEqual({ earned: 1000, held: 550, available: 450 });
    // An activity rejected after a claim: the saldo may go below zero (shown as it is).
    expect(saldoFrom(300, claims).available).toBe(-250);
  });
});

describe("reward state", () => {
  const base = { cost: 500, stock: 3, taken: 0, perPerson: 1, mine: 0, available: 500 };
  it("is available with enough saldo, short without, sold out past the stock, at the limit when I have it", () => {
    expect(rewardState(base)).toBe("available");
    expect(rewardState({ ...base, available: 499 })).toBe("short");
    expect(rewardState({ ...base, taken: 3 })).toBe("sold_out");
    expect(rewardState({ ...base, stock: null, taken: 999 })).toBe("available");
    // Already mine wins over sold out (my claim is one of the taken).
    expect(rewardState({ ...base, taken: 3, mine: 1 })).toBe("limit");
  });
  it("maps a row with what is left and how many I hold", () => {
    const row = { id: ID, title: "Voucher Decathlon 250k", description: "", cost: 35000, stock: 4, per_person: 1 };
    expect(toReward(row, ["https://x/a.jpg"], 3, 0, 40000)).toMatchObject({ left: 1, state: "available", photos: ["https://x/a.jpg"] });
    expect(toReward({ ...row, stock: null }, [], 3, 0, 1000)).toMatchObject({ left: null, state: "short" });
    expect(toReward(row, [], 5, 0, 99999).left).toBe(0);
  });
});

describe("claims", () => {
  it("says why a claim was refused, in words for the employee", () => {
    expect(claimRefusal("reward_balance")).toMatchObject({ code: "balance" });
    expect(claimRefusal('P0001: reward_sold_out')).toMatchObject({ code: "sold_out" });
    expect(claimRefusal("reward_limit")).toMatchObject({ code: "limit" });
    expect(claimRefusal("reward_unavailable")).toMatchObject({ code: "unavailable" });
    expect(claimRefusal("connection reset")).toBeNull();
  });
  it("counts per reward what holds points and what still waits", () => {
    const { taken, waiting } = claimCounts([
      { reward_id: "a", status: "requested" }, { reward_id: "a", status: "approved" }, { reward_id: "a", status: "delivered" },
      { reward_id: "a", status: "rejected" }, { reward_id: "b", status: "cancelled" },
    ]);
    expect(taken.get("a")).toBe(3);
    expect(waiting.get("a")).toBe(2);
    expect(taken.get("b")).toBeUndefined();
  });
  it("maps claims for the employee and the admin (the nama panggilan first)", () => {
    const row = { id: ID, reward_id: "r", employee_id: "e", cost: 400, reward_title: "Tumbler", status: "rejected", note: "", reason: "Stok habis", created_at: "2026-11-18T01:00:00Z",
      decided_by_name: "Meida", decided_at: "2026-11-18T02:00:00Z", delivered_by_name: null, delivered_at: null, person: { full_name: "Dewi Contoh", nickname: "Dewi", department: "Creative" } };
    expect(toClaim(row, null)).toMatchObject({ title: "Tumbler", status: "rejected", reason: "Stok habis", decidedAt: "2026-11-18T02:00:00Z" });
    expect(toAdminClaim(row, "https://x/p.jpg")).toMatchObject({ employeeName: "Dewi", department: "Creative", decidedBy: "Meida", rewardPhoto: "https://x/p.jpg" });
    expect(toAdminClaim({ ...row, person: { full_name: "Dewi Contoh", nickname: "", department: "" } }, null).employeeName).toBe("Dewi Contoh");
  });
  it("lets an admin hand over a request or an approved claim, reject only with a reason", () => {
    expect(claimActionFrom.deliver).toEqual(["requested", "approved"]);
    expect(claimActionFrom.approve).toEqual(["requested"]);
    expect(claimDecisionSchema.safeParse({ action: "reject", reason: " " }).success).toBe(false);
    expect(claimDecisionSchema.safeParse({ action: "reject", reason: "Stok habis" }).success).toBe(true);
    expect(claimDecisionSchema.safeParse({ action: "approve" }).success).toBe(true);
    expect(claimRequestSchema.safeParse({ rewardId: "x" }).success).toBe(false);
    expect(claimRequestSchema.parse({ rewardId: ID })).toEqual({ rewardId: ID, note: "" });
  });
});

describe("rewards", () => {
  it("keeps reward photos under wellbeing/hadiah/ with keys the server made", () => {
    const key = rewardPhotoKey(ID, "image/webp");
    expect(key).toBe(`wellbeing/hadiah/${ID}.webp`);
    expect(isRewardPhotoKey(key, "image/webp")).toBe(true);
    expect(isRewardPhotoKey(key, "image/jpeg")).toBe(false);
    expect(isRewardPhotoKey(`wellbeing/${ID}/${ID}.webp`, "image/webp")).toBe(false);
    expect(isRewardPhotoKey(`wellbeing/hadiah/../${ID}.webp`, "image/webp")).toBe(false);
  });
  it("checks what an admin saves", () => {
    const ok = { title: "Garmin Sport Watch", cost: 300000, stock: 1, perPerson: 1, active: false };
    expect(rewardInputSchema.parse(ok)).toMatchObject({ description: "", photos: [] });
    expect(rewardInputSchema.safeParse({ ...ok, title: "G" }).success).toBe(false);
    expect(rewardInputSchema.safeParse({ ...ok, cost: 0 }).success).toBe(false);
    expect(rewardInputSchema.safeParse({ ...ok, stock: null }).success).toBe(true);
    expect(rewardInputSchema.safeParse({ ...ok, photos: [{ key: "a" }, { key: "a" }] }).success).toBe(false);
    expect(rewardInputSchema.safeParse({ ...ok, photos: Array.from({ length: 7 }, (_, i) => ({ key: `k${i}` })) }).success).toBe(false);
  });
});
