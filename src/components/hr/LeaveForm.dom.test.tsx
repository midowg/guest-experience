import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderIn } from "./test-lang";
import type { LeaveRequest, TeamLeave } from "@/lib/hr/leave";

/* Ajukan cuti and Tim (21 Nov 2026) with the server replaced: made-up people. */
const api = vi.hoisted(() => ({ submitLeave: vi.fn(), loadTeam: vi.fn() }));
vi.mock("./clockInApi", () => api);

const { LeaveSheet } = await import("./LeaveForm");
const { TeamScreen } = await import("./TeamScreen");
afterEach(() => { cleanup(); api.submitLeave.mockReset(); api.loadTeam.mockReset(); window.localStorage.clear(); });

const mine: LeaveRequest = { id: "l1", type: "cuti", startDate: "2026-11-25", endDate: "2026-11-27", note: "Pulang kampung", status: "menunggu", decidedLabel: null, decisionNote: null, createdAt: "2026-11-19T03:00:00Z" };

it("sends a span of days with a note, with Kirim only when it can", async () => {
  api.submitLeave.mockResolvedValue("Pengajuan terkirim.");
  const done = vi.fn();
  renderIn("id", <LeaveSheet today="2026-11-20" initialType="sakit" leaves={[]} onDone={done} onCancel={() => undefined} />);
  expect(screen.getByRole("heading", { name: "Ajukan sakit" })).toBeTruthy();
  const send = screen.getByRole("button", { name: "Kirim" }) as HTMLButtonElement;
  expect(send.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Sampai"), { target: { value: "2026-11-21" } });
  expect(screen.getByText("2 hari")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Keterangan"), { target: { value: "Demam tinggi" } });
  expect(send.disabled).toBe(false);
  fireEvent.click(send);
  await waitFor(() => expect(done).toHaveBeenCalledWith("Pengajuan terkirim."));
  expect(api.submitLeave).toHaveBeenCalledWith({ type: "sakit", startDate: "2026-11-20", endDate: "2026-11-21", note: "Demam tinggi" });
});

it("says when the days meet another of the person's own requests, and does not send", () => {
  renderIn("id", <LeaveSheet today="2026-11-20" initialType="izin" leaves={[mine]} onDone={() => undefined} onCancel={() => undefined} />);
  fireEvent.change(screen.getByLabelText("Mulai"), { target: { value: "2026-11-26" } });
  fireEvent.change(screen.getByLabelText("Keterangan"), { target: { value: "Urusan keluarga" } });
  expect(screen.getByText(/bertemu dengan pengajuanmu yang lain/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "Kirim" }) as HTMLButtonElement).disabled).toBe(true);
});

const team: TeamLeave[] = [
  { id: "t1", employeeId: "e2", name: "Contoh Dua", department: "Contoh", type: "dinas", startDate: "2026-11-19", endDate: "2026-11-21", status: "disetujui", mine: false },
  { id: "t2", employeeId: "e1", name: "Contoh Satu", department: "Contoh", type: "cuti", startDate: "2026-11-25", endDate: "2026-11-27", status: "menunggu", mine: true },
];

it("shows the team's days as a calendar and as a list, approved and waiting in words", async () => {
  api.loadTeam.mockResolvedValue({ ready: true, leaves: team });
  renderIn("id", <TeamScreen today="2026-11-20" stamp="a" />);
  expect(await screen.findByRole("button", { name: /Jumat, 20 November: 1 orang, Dinas/ })).toBeTruthy();
  expect(screen.getByText("Contoh Dua")).toBeTruthy();
  expect(screen.getByText("Disetujui")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Daftar" }));
  expect(screen.getByRole("heading", { name: "Hari ini" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Akan datang" })).toBeTruthy();
  expect(screen.getByText("(kamu)", { exact: false })).toBeTruthy();
  expect(screen.getByText("Menunggu")).toBeTruthy();
  expect(api.loadTeam).toHaveBeenCalledWith("2026-11");
});

it("says plainly when cuti is not open yet", async () => {
  api.loadTeam.mockResolvedValue({ ready: false, leaves: [] });
  // A new stamp (the person's own requests changed) reads the team again instead of the kept month.
  renderIn("id", <TeamScreen today="2026-11-20" stamp="b" />);
  expect(await screen.findByText("Cuti dan izin belum dibuka")).toBeTruthy();
});

it("keeps a month it has read while the stamp stays the same (Tim opened again)", async () => {
  api.loadTeam.mockResolvedValue({ ready: true, leaves: team });
  renderIn("id", <TeamScreen today="2026-11-20" stamp="c" />);
  await screen.findByText("Contoh Dua");
  cleanup();
  renderIn("id", <TeamScreen today="2026-11-20" stamp="c" />);
  expect(screen.getByText("Contoh Dua")).toBeTruthy();
  expect(api.loadTeam).toHaveBeenCalledTimes(1);
});
