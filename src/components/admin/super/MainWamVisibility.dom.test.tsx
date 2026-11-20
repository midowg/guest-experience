import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MainWamVisibilitySettings } from "./MainWamVisibility";

/* Super admin → Halaman utama → Main WAM: hidden by default, shown after a confirmation, and back. */

let calls: { url: string; body: unknown }[] = [];
beforeEach(() => {
  calls = [];
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { shown: boolean };
    calls.push({ url, body });
    return new Response(JSON.stringify({ ok: true, data: { shown: body.shown, migrated: true, changedAt: "2026-11-20T03:00:00Z", changedBy: "Super admin" }, message: body.shown ? "Main WAM ditampilkan di Journey." : "Main WAM disembunyikan lagi dari Journey." }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows Main WAM after a confirmation, and hides it again", async () => {
  render(<MainWamVisibilitySettings initial={{ shown: false, migrated: true, changedAt: null, changedBy: null }} />);
  expect(screen.getByText("Tersembunyi")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Tampilkan Main WAM" }));
  expect(await screen.findByText("Main WAM ditampilkan di Journey.")).toBeTruthy();
  expect(screen.getByText("Ditampilkan")).toBeTruthy();
  expect(screen.getByText(/Diubah Super admin/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Sembunyikan lagi" }));
  expect(await screen.findByText("Main WAM disembunyikan lagi dari Journey.")).toBeTruthy();
  expect(calls).toEqual([{ url: "/api/admin/main-wam-tampil", body: { shown: true } }, { url: "/api/admin/main-wam-tampil", body: { shown: false } }]);
});

it("changes nothing when the confirmation is cancelled, and cannot be switched before the migration", () => {
  vi.stubGlobal("confirm", vi.fn(() => false));
  const { unmount } = render(<MainWamVisibilitySettings initial={{ shown: false, migrated: true, changedAt: null, changedBy: null }} />);
  fireEvent.click(screen.getByRole("button", { name: "Tampilkan Main WAM" }));
  expect(calls).toEqual([]);
  unmount();
  render(<MainWamVisibilitySettings initial={{ shown: false, migrated: false, changedAt: null, changedBy: null }} />);
  expect((screen.getByRole("button", { name: "Tampilkan Main WAM" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/menunggu migrasi/)).toBeTruthy();
});
