import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ResetRequestList, ResetRequestRow } from "@/lib/server/pra-wam/reset-requests";
import { praWamResetRequestsApi } from "@/lib/routes";
import { PraWamResetRequests, mergeHistory, resetBlocked } from "./PraWamResetRequests";
import { RoleGuide } from "./akun/RoleGuide";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

const request = (patch: Partial<ResetRequestRow>): ResetRequestRow => ({
  id: "r1", employeeId: "e1", name: "Dewi Lestari", department: "Finance", email: "dewi@werkudara.com", note: "Lupa setelah ganti HP",
  status: "menunggu", handledBy: null, handledAt: null, createdAt: "2026-11-05T01:30:00Z", hasAccount: true, ...patch,
});
const open = [request({}), request({ id: "r2", employeeId: null, name: null, department: null, email: "salah@contoh.com", note: "" })];
const done = (id: string, handledAt: string, status: ResetRequestRow["status"] = "selesai") => request({ id, status, handledAt, handledBy: "admin" });
const list: ResetRequestList = { migrated: true, open, history: [done("h1", "2026-11-04T03:00:00Z")] };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, message: "Permintaan ditolak.", data: { migrated: true, open: [open[0]], history: [done("r2", "2026-11-05T02:00:00Z", "ditolak"), ...list.history] } }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Akun dan peran, tab Permintaan reset", () => {
  it("shows open requests as cards with the time, note and both answers", () => {
    render(<PraWamResetRequests initial={list} passwordReady recent={[]} subtitle="2 orang punya akun. 1 sudah masuk, 1 belum pernah." />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Akun dan peran");
    const tabs = within(screen.getByRole("navigation", { name: "Bagian akun dan peran" })).getAllByRole("link");
    expect(tabs[2].getAttribute("aria-current")).toBe("page");
    expect(tabs[2].textContent).toContain("2 permintaan reset menunggu");
    const cards = within(screen.getByRole("list", { name: /menunggu/ })).getAllByRole("listitem");
    expect(cards[0].textContent).toContain("dewi@werkudara.com · diminta 5 Nov, 08.30 · Finance");
    expect(cards[0].textContent).toContain("Lupa setelah ganti HP");
    expect(cards[0].textContent).toContain("Menunggu");
    expect(within(cards[0]).getByRole("button", { name: "Reset password" })).toHaveProperty("disabled", false);
    // An email not in Data karyawan can only be declined.
    expect(cards[1].textContent).toContain("Email tidak terdaftar");
    expect(within(cards[1]).getByRole("button", { name: "Reset password" })).toHaveProperty("disabled", true);
    expect(within(cards[1]).getByRole("button", { name: "Tolak" })).toHaveProperty("disabled", false);
  });

  it("declines one, then lists it under Selesai", async () => {
    render(<PraWamResetRequests initial={list} passwordReady recent={[]} />);
    const second = within(screen.getByRole("list", { name: /menunggu/ })).getAllByRole("listitem")[1];
    await act(async () => { fireEvent.click(within(second).getByRole("button", { name: "Tolak" })); });
    expect(fetchMock).toHaveBeenCalledWith(praWamResetRequestsApi("r2"), expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "tolak" }) }));
    expect(screen.getByText("Email tidak terdaftar: Permintaan ditolak.")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: /menunggu/ })).getAllByRole("listitem")).toHaveLength(1);
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[1].textContent).toContain("Ditolak");
  });

  it("asks before resetting to the first password", async () => {
    render(<PraWamResetRequests initial={list} passwordReady recent={[]} />);
    const first = within(screen.getByRole("list", { name: /menunggu/ })).getAllByRole("listitem")[0];
    fireEvent.click(within(first).getByRole("button", { name: "Reset password" }));
    await act(async () => { fireEvent.click(within(screen.getByRole("dialog", { name: "Atur ulang password?" })).getByRole("button", { name: "Atur ulang" })); });
    expect(fetchMock).toHaveBeenCalledWith(praWamResetRequestsApi("r1"), expect.objectContaining({ body: JSON.stringify({ action: "reset" }) }));
  });

  it("says the migration is missing", () => {
    render(<PraWamResetRequests initial={{ migrated: false, open: [], history: [] }} passwordReady />);
    expect(screen.getByText(/menunggu migrasi 202611040010/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Muat ulang" })).toBeNull();
  });
});

describe("reset rules", () => {
  it("block the reset without a known email, an account, or the first password", () => {
    expect(resetBlocked(request({ employeeId: null }), true)).toMatch(/tidak ada di Data karyawan/);
    expect(resetBlocked(request({ hasAccount: false }), true)).toMatch(/belum punya akun/);
    expect(resetBlocked(request({}), false)).toMatch(/Password awal/);
    expect(resetBlocked(request({}), true)).toBeNull();
  });

  it("keep the handled requests of the last days, the newest first and each once", () => {
    const now = Date.parse("2026-11-05T12:00:00Z");
    const merged = mergeHistory([done("a", "2026-10-01T00:00:00Z"), done("b", "2026-11-01T00:00:00Z")], [done("b", "2026-11-01T00:00:00Z", "ditolak"), done("c", "2026-11-05T00:00:00Z")], 30, now);
    expect(merged.map(row => `${row.id}:${row.status}`)).toEqual(["c:selesai", "b:ditolak"]);
  });
});

describe("tab Peran", () => {
  it("gives every role a card with its count and what it goes with; BOD stands alone", () => {
    render(<RoleGuide counts={{ peserta: 40, panitia: 6, admin: 2, hod: 9, bod: 3 }} />);
    const cards = within(screen.getByRole("list", { name: "Peran dan gabungannya" })).getAllByRole("article");
    expect(cards.map(card => card.querySelector("h3")?.textContent)).toEqual(["Peserta", "Panitia", "Admin WAM", "HOD", "BOD"]);
    expect(cards[1].textContent).toContain("6 orang");
    expect(cards[1].textContent).toContain("Bisa digabung: Admin WAM, HOD");
    expect(cards[4].textContent).toContain("Tidak bisa digabung");
  });
});
