import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AdminApiError } from "@/components/admin/shared/api";
import { MONTHLY_QUOTA } from "@/lib/coffee/menu";
import { ManualSheet } from "./ManualSheet";
import { createSampleServer } from "./sample";
import css from "./coffee-admin.module.css";

/*
 * Catat manual (25 Nov 2026): each field says what is wrong under itself, a full quota refuses a
 * claim (the line under the name, and the server's 409), and a guest's or team's drink is sent
 * with its room and count. Made-up people only.
 */
const NOW = Date.parse("2026-11-25T03:00:00.000Z");

function open() {
  const server = createSampleServer();
  const api = { ...server.api, manual: vi.fn(server.api.manual) };
  const onSaved = vi.fn(), onClose = vi.fn();
  render(<div className={css.root}><ManualSheet api={api} now={NOW} actorName="Dewi" settings={{ ...MONTHLY_QUOTA }} onClose={onClose} onSaved={onSaved} /></div>);
  return { server, api, onSaved, onClose };
}
async function pick(label: string, word: string, name: RegExp) {
  const input = screen.getByRole("combobox", { name: label });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: word } });
  fireEvent.mouseDown(await screen.findByRole("option", { name }));
}
const save = () => fireEvent.click(screen.getByRole("button", { name: /Simpan/ }));

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(NOW)); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("starts at now (WIB), as a claim, and may not go further back than the start of last month", () => {
  open();
  const day = screen.getByLabelText("Tanggal") as HTMLInputElement;
  expect(day.value).toBe("2026-11-25");
  expect(day.min).toBe("2026-10-01");
  expect(day.max).toBe("2026-11-25");
  expect((screen.getByLabelText("Jam") as HTMLInputElement).value).toBe("10:00");
  expect((screen.getByRole("radio", { name: "Klaim" }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByRole("dialog").textContent).toMatch(/Tersimpan sebagai selesai dan ditandai “Dicatat manual”/);
});

it("holds the form back with what is wrong under each field", async () => {
  const { api } = open();
  fireEvent.change(screen.getByLabelText("Minuman"), { target: { value: "lainnya" } });
  fireEvent.change(screen.getByLabelText("Jam"), { target: { value: "23:30" } });
  save();
  expect(screen.getByText("Pilih nama karyawan.")).toBeTruthy();
  expect(screen.getByText("Tulis nama minumannya.")).toBeTruthy();
  expect(screen.getByText("Tanggal dan jam tidak boleh di masa depan.")).toBeTruthy();
  expect(screen.getByRole("combobox", { name: "Nama karyawan" }).getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByLabelText("Nama minuman").getAttribute("aria-invalid")).toBe("true");
  expect(api.manual).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("radio", { name: "Tamu" }));
  expect(screen.getByText("Pilih PIC tamu.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Tanggal"), { target: { value: "2026-09-30" } });
  expect(screen.getByText("Catat manual paling lama sampai awal bulan lalu.")).toBeTruthy();
});

it("offers only the temperatures the drink comes in", () => {
  open();
  fireEvent.change(screen.getByLabelText("Minuman"), { target: { value: "espresso" } });
  expect((screen.getByRole("radio", { name: "Es" }) as HTMLInputElement).disabled).toBe(true);
  expect(screen.queryByRole("group", { name: "Takaran es" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Minuman"), { target: { value: "cucumber-ice" } });
  expect((screen.getByRole("radio", { name: "Es" }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByRole("group", { name: "Takaran es" })).toBeTruthy();
});

it("saves a claim as done and says which claim of the month it is", async () => {
  const { api, onSaved } = open();
  await pick("Nama karyawan", "arief", /Arief Hidayat/);
  expect((await screen.findByRole("status")).textContent).toBe("Ini klaim ke-2 dari 4 bulan November.");
  save();
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(api.manual).toHaveBeenCalledWith(expect.objectContaining({ kind: "klaim", employeeId: "p-arief", date: "2026-11-25", time: "10:00", slug: "kopi-susu", temperature: "panas", sugar: "Normal" }));
  expect(api.manual.mock.calls[0][0]).not.toHaveProperty("room");
  const done = onSaved.mock.calls[0][0];
  expect(done.message).toBe("Arief · Kopi Susu · klaim ke-2 dari 4.");
  expect(done.order).toMatchObject({ status: "selesai", manual: true });
});

it("refuses a claim when that month's quota is full, and points to Tim · rapat", async () => {
  const { api, onSaved } = open();
  await pick("Nama karyawan", "maya", /Maya Lestari/);
  expect((await screen.findByRole("status")).textContent).toBe("Jatah November Maya sudah habis (4 dari 4). Bila untuk rapat, pilih Tim · rapat.");
  save();
  expect(api.manual).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
});

it("shows the server's refusal when the quota filled up in the meantime", async () => {
  const { api, onSaved } = open();
  await pick("Nama karyawan", "arief", /Arief Hidayat/);
  await screen.findByRole("status");
  api.manual.mockRejectedValueOnce(new AdminApiError("Jatah bulan ini sudah habis.", undefined, 409));
  save();
  expect((await screen.findByRole("alert")).textContent).toBe("Jatah bulan ini sudah habis.");
  expect(onSaved).not.toHaveBeenCalled();
  expect((screen.getByRole("button", { name: /Simpan/ }) as HTMLButtonElement).disabled).toBe(false);
});

it("puts the server's field errors under their fields", async () => {
  const { api } = open();
  await pick("Nama karyawan", "arief", /Arief Hidayat/);
  api.manual.mockRejectedValueOnce(new AdminApiError("Periksa kembali isian formulir.", { date: ["Catat manual paling lama sampai awal bulan lalu."] }, 422));
  save();
  await waitFor(() => expect(screen.getByText("Catat manual paling lama sampai awal bulan lalu.")).toBeTruthy());
  expect(screen.getByLabelText("Tanggal").getAttribute("aria-invalid")).toBe("true");
});

it("sends a guest's drinks with the PIC, the room, the guest and the count", async () => {
  const { api, onSaved } = open();
  fireEvent.click(screen.getByRole("radio", { name: "Tamu" }));
  await pick("PIC tamu", "sari", /Sari Wulandari/);
  fireEvent.change(screen.getByLabelText(/Tamu\/instansi/), { target: { value: "PT Mitra (contoh)" } });
  fireEvent.change(screen.getByLabelText(/Jumlah tamu/), { target: { value: "4" } });
  fireEvent.change(screen.getByLabelText("Ruangan"), { target: { value: "Vasuki Room" } });
  fireEvent.change(screen.getByLabelText("Jumlah"), { target: { value: "0" } });
  save();
  expect(screen.getByText("Jumlah 1 sampai 50.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Jumlah"), { target: { value: "4" } });
  save();
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(api.manual).toHaveBeenCalledWith(expect.objectContaining({ kind: "tamu", employeeId: "p-sari", qty: 4, room: "Vasuki Room", guest: "PT Mitra (contoh)", guestCount: 4 }));
  expect(onSaved.mock.calls[0][0].message).toBe("Tamu · 4× Kopi Susu · PIC Sari.");
  expect(within(screen.getByRole("dialog")).queryByRole("status")).toBeNull(); // no quota line for a guest
});
