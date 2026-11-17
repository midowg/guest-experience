import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { vouchersApi } from "@/lib/routes";
import type { WbVoucher, WbVouchersAdmin } from "@/lib/wellbeing/types";
import { RerollVouchers } from "./RerollVouchers";

/* Super admin → Voucher re-roll (18 Nov 2026, uji coba). */

const DEWI = "11111111-2222-4333-8444-555555555555", BAYU = "21111111-2222-4333-8444-555555555555";
const base: WbVoucher = {
  id: "a1111111-2222-4333-8444-555555555555", employeeId: DEWI, employeeName: "Dewi", department: "Creative", legendary: false, status: "open", note: "", createdAt: "2026-11-18T03:00:00.000Z",
  claim: { id: "c1111111-2222-4333-8444-555555555555", title: "Voucher re-roll tokoh", cost: 5000, status: "delivered" }, givenBy: null,
  usedAt: null, before: null, after: null, restorable: false, revokedAt: null, revokedBy: null, revokeReason: null, restoredAt: null, restoredBy: null,
};
const used: WbVoucher = { ...base, id: "b1111111-2222-4333-8444-555555555555", employeeId: BAYU, employeeName: "Bayu", legendary: true, status: "used", usedAt: "2026-11-18T04:00:00.000Z",
  claim: { ...base.claim!, title: "Voucher re-roll Legendary", cost: 25000 }, before: { figure: "Ki Hajar Dewantara", tier: "Rare" }, after: { figure: "Susi Susanti", tier: "Legendary" }, restorable: true };
const data: WbVouchersAdmin = {
  migrated: true, vouchers: [base, used],
  people: [{ id: DEWI, name: "Dewi Contoh", nickname: "Dewi", department: "Creative", category: "tetap", hasCard: true }, { id: BAYU, name: "Bayu Prakoso", nickname: "Bayu", department: "Finance", category: "tetap", hasCard: true }],
  legend: { name: "Legendary", cap: 3, cards: 2, reserved: 0 },
};
const ok = (payload: unknown, message: string) => new Response(JSON.stringify({ ok: true, data: payload, message }), { status: 200, headers: { "Content-Type": "application/json" } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("lists every voucher with what it did, and corrects one with a reason the employee reads", async () => {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) });
    return ok({ ...base, status: "revoked", revokedAt: "2026-11-18T06:00:00.000Z", revokeReason: "Salah sistem", claim: { ...base.claim!, status: "rejected" } }, "Voucher dibatalkan. Poinnya kembali ke saldo karyawan.");
  }));
  render(<RerollVouchers initial={data} />);
  expect(screen.getByText(/Legendary: 2 kartu dari batas 3/)).toBeTruthy();
  const rows = screen.getAllByRole("row").slice(1);
  // Used: what changed, and both corrections; unused: only cancel.
  expect(within(rows[1]).getByText(/Ki Hajar Dewantara \(Rare\) → Susi Susanti \(Legendary\)/)).toBeTruthy();
  expect(within(rows[1]).getByRole("button", { name: "Kembalikan poin" })).toBeTruthy();
  expect(within(rows[1]).getByRole("button", { name: "Kembalikan kartu" })).toBeTruthy();
  expect(within(rows[0]).queryByRole("button", { name: "Kembalikan kartu" })).toBeNull();
  fireEvent.click(within(rows[0]).getByRole("button", { name: "Batalkan voucher" }));
  const editor = screen.getByRole("region", { name: "Batalkan voucher" });
  expect(editor.textContent).toContain("5.000 poin kembali ke saldonya");
  const confirm = within(editor).getByRole("button", { name: "Batalkan voucher" }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.change(within(editor).getByLabelText(/Alasan/), { target: { value: "Salah sistem" } });
  fireEvent.click(confirm);
  expect(await screen.findByText("Voucher dibatalkan. Poinnya kembali ke saldo karyawan.")).toBeTruthy();
  expect(calls).toEqual([{ url: vouchersApi(base.id), body: { action: "revoke", reason: "Salah sistem" } }]);
  expect(within(screen.getAllByRole("row")[1]).getByText("Dibatalkan")).toBeTruthy();
});

it("gives a voucher by hand, without points", async () => {
  const calls: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    calls.push(JSON.parse(init.body as string));
    return ok({ ...base, id: "d1111111-2222-4333-8444-555555555555", employeeId: BAYU, employeeName: "Bayu", legendary: true, claim: null, givenBy: "Super admin", note: "Pengganti" }, "Voucher Legendary diberikan.");
  }));
  render(<RerollVouchers initial={data} />);
  fireEvent.click(screen.getByRole("button", { name: "Beri voucher" }));
  fireEvent.change(screen.getByLabelText("Karyawan"), { target: { value: "bayu fin" } });
  fireEvent.click(screen.getByRole("button", { name: /Bayu Prakoso/ }));
  fireEvent.click(screen.getByLabelText(/Re-roll Legendary/));
  fireEvent.change(screen.getByLabelText(/Catatan/), { target: { value: "Pengganti" } });
  fireEvent.click(within(screen.getByRole("region", { name: "Beri voucher" })).getByRole("button", { name: "Beri voucher" }));
  expect(await screen.findByText("Voucher Legendary diberikan.")).toBeTruthy();
  expect(calls).toEqual([{ employeeId: BAYU, legendary: true, note: "Pengganti" }]);
  expect(screen.getByText(/Diberi Super admin/)).toBeTruthy();
});

it("waits for the migration", () => {
  render(<RerollVouchers initial={{ migrated: false, vouchers: [], people: [], legend: null }} />);
  expect(screen.getByText(/menunggu migrasi 202611180003_wellbeing_reroll_voucher\.sql/)).toBeTruthy();
});
