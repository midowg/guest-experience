import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { adminRequest } from "@/components/admin/shared/api";
import { MinutesRuleCard } from "./MinutesRuleCard";

vi.mock("@/components/admin/shared/api", async original => ({
  ...(await original<typeof import("@/components/admin/shared/api")>()),
  adminRequest: vi.fn(async (_url: string, init: { body: string }) => ({ ok: true, data: JSON.parse(init.body), message: "Aturan MoM disimpan." })),
}));
afterEach(() => { cleanup(); vi.mocked(adminRequest).mockClear(); });

const rule = { forum: true, rapat: true, acara: false, berdua: false, windowHours: 24 };

it("switches a kind on and saves the whole rule", async () => {
  render(<MinutesRuleCard initial={rule} migrated />);
  expect((screen.getByRole("button", { name: "Simpan aturan" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("switch", { name: "Acara: wajib MoM" }));
  fireEvent.click(screen.getByRole("button", { name: "Simpan aturan" }));
  await waitFor(() => expect(screen.getByText("Aturan MoM disimpan.")).toBeTruthy());
  expect(JSON.parse((vi.mocked(adminRequest).mock.calls[0][1] as { body: string }).body)).toEqual({ ...rule, acara: true });
});

it("sets how long a MoM can be written: hours after the meeting, a quick pick, or no limit", async () => {
  render(<MinutesRuleCard initial={rule} migrated />);
  expect(screen.getByText(/sampai 24 jam setelah meeting selesai/)).toBeTruthy();
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "0" } });
  expect(screen.getByText(/Isi angka bulat 1 sampai 720/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "3 hari" }));
  expect(screen.getByText(/sampai 3 hari setelah meeting selesai/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Simpan aturan" }));
  await waitFor(() => expect(screen.getByText("Aturan MoM disimpan.")).toBeTruthy());
  expect(JSON.parse((vi.mocked(adminRequest).mock.calls[0][1] as { body: string }).body)).toEqual({ ...rule, windowHours: 72 });

  // Always open: the hours go.
  fireEvent.click(screen.getByRole("switch", { name: "Batasi waktu pengisian MoM" }));
  expect(screen.getByText(/Tanpa batas: MoM selalu bisa diisi dan direvisi/)).toBeTruthy();
  expect(screen.queryByRole("spinbutton")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Simpan aturan" }));
  await waitFor(() => expect(vi.mocked(adminRequest)).toHaveBeenCalledTimes(2));
  expect(JSON.parse((vi.mocked(adminRequest).mock.calls[1][1] as { body: string }).body)).toEqual({ ...rule, windowHours: null });
});

it("waits for the migration, with the switches off", () => {
  render(<MinutesRuleCard initial={rule} migrated={false} />);
  expect(screen.getByText(/menunggu migrasi 202611120001/)).toBeTruthy();
  expect((screen.getByRole("switch", { name: "Forum: wajib MoM" }) as HTMLInputElement).disabled).toBe(true);
});
