import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ProgressReport } from "@/lib/server/pra-wam/questionnaire-admin";
import { QuestionnaireProgress } from "./QuestionnaireProgress";
import { StayPurge } from "./StayPurge";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);

const person = (employeeId: string, state: "belum" | "sedang" | "selesai") => ({ employeeId, name: employeeId, department: "Comms", state, sectionsDone: 0, sectionsTotal: 6, lastActivity: null });
const report = {
  formName: "Kuesioner", sectionsTotal: 6, counts: { belum: 2, sedang: 1, selesai: 1 },
  departments: [], people: [person("Ayu", "belum"), person("Budi", "belum"), person("Citra", "sedang"), person("Dodi", "selesai")],
} as unknown as ProgressReport;

it("reminds everyone not done, or the group picked, and says when it was last sent", () => {
  render(<QuestionnaireProgress report={report} reminder={{ open: true, last: { at: "2026-11-10T02:00:00Z", recipients: 3 } }} />);
  const button = screen.getByRole("button", { name: /Ingatkan yang belum selesai \(3\)/ });
  expect((button as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByText(/Terakhir dikirim .* ke 3 orang\./)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Sedang mengisi/ }));
  expect(screen.getByRole("button", { name: /Ingatkan yang sedang mengisi \(1\)/ })).toBeTruthy();
});

it("cannot remind while the questionnaire is closed", () => {
  render(<QuestionnaireProgress report={report} reminder={{ open: false, last: null }} />);
  expect((screen.getByRole("button", { name: /Ingatkan yang belum selesai/ }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/hanya bisa dikirim selama kuesioner dibuka/)).toBeTruthy();
});

it("shows when the stay data goes, offers Hapus sekarang only after the date, and says when it is gone", () => {
  const { rerender } = render(<StayPurge status={{ date: "2027-02-06", due: false, answers: 120, roommates: 40 }} />);
  expect(screen.getByText(/Terjadwal: 6 Februari 2027, mulai pukul 00.00 WIB/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Hapus sekarang/ })).toBeNull();
  rerender(<StayPurge status={{ date: "2027-02-06", due: true, answers: 120, roommates: 40 }} />);
  expect(screen.getByRole("button", { name: /Hapus sekarang/ })).toBeTruthy();
  rerender(<StayPurge status={{ date: "2027-02-06", due: true, answers: 0, roommates: 0 }} />);
  expect(screen.getByText(/Sudah dihapus/)).toBeTruthy();
  rerender(<StayPurge status={{ date: null, due: false, answers: 0, roommates: 0 }} />);
  expect(screen.getByText(/Tanggal hapus belum diatur/)).toBeTruthy();
});
