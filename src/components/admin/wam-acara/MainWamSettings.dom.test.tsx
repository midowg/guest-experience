import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { defaultSettings } from "@/lib/main-wam/settings";
import { mainWamAdminApi } from "@/lib/routes";

const request = vi.fn();
vi.mock("@/components/admin/shared/api", async importOriginal => ({ ...(await importOriginal<object>()), adminRequest: (...args: unknown[]) => request(...args) }));
const { MainWamSettings } = await import("./MainWamSettings");

afterEach(() => { cleanup(); request.mockReset(); });

const settings = { ...defaultSettings(), migrated: true };
const people = [{ id: "11111111-1111-4111-8111-111111111111", fullName: "Rani Contoh", department: "CoE" }, { id: "22222222-2222-4222-8222-222222222222", fullName: "Sari Contoh", department: "HRGA" }];
const tester = { employeeId: people[1].id, fullName: "Sari Contoh", department: "HRGA", addedBy: "Admin Contoh", addedAt: "2026-11-17T10:00:00Z" };
const draw = (initial = settings) => render(<MainWamSettings initial={initial} testers={[tester]} testersMigrated people={people} forms={[{ slug: "survei-wam", name: "Survei WAM" }]} storage />);

it("asks before opening WAM 2026 to everyone, then saves the mode", async () => {
  request.mockResolvedValue({ message: "Mode acara: WAM 2026 (semua).", data: { ...settings, mode: "semua" } });
  draw();
  const card = screen.getByRole("region", { name: "Mode acara" });
  expect((within(card).getByRole("radio", { name: /Pra WAM \(bawaan\)/ }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(within(card).getByRole("radio", { name: /WAM 2026 \(semua\)/ }));
  fireEvent.click(within(card).getByRole("button", { name: "Pakai mode ini" }));
  expect(request).not.toHaveBeenCalled();
  expect(within(card).getByRole("alert").textContent).toMatch(/Semua orang yang membuka \/wam akan masuk WAM 2026/);
  fireEvent.click(within(card).getByRole("button", { name: "Ya, buka untuk semua" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request.mock.calls[0][0]).toBe(mainWamAdminApi.settings);
  expect(JSON.parse((request.mock.calls[0][1] as { body: string }).body)).toEqual({ mode: "semua" });
  expect(await screen.findByText("Mode acara: WAM 2026 (semua).")).toBeTruthy();
});

it("switches a module on and saves it with the survey's questionnaire", async () => {
  request.mockResolvedValue({ message: "Pengaturan WAM 2026 tersimpan.", data: settings });
  draw();
  const card = screen.getByRole("region", { name: "Modul" });
  fireEvent.click(within(card).getByRole("switch", { name: "Survei" }));
  fireEvent.change(within(card).getByLabelText("Kuesioner survei"), { target: { value: "survei-wam" } });
  fireEvent.click(within(card).getByRole("button", { name: "Simpan modul" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  const body = JSON.parse((request.mock.calls[0][1] as { body: string }).body);
  expect(body.modules.survei).toBe(true);
  expect(body.moduleConfig).toEqual({ survei: { formSlug: "survei-wam" } });
});

it("lists penguji, adds one picked by name and removes one", async () => {
  request.mockResolvedValueOnce({ message: "Penguji ditambahkan.", data: { testers: [tester, { ...tester, employeeId: people[0].id, fullName: "Rani Contoh", department: "CoE" }] } });
  draw();
  const card = screen.getByRole("region", { name: "Penguji" });
  expect(within(card).getByText("Sari Contoh")).toBeTruthy();
  const add = within(card).getByRole("button", { name: "Tambah" }) as HTMLButtonElement;
  expect(add.disabled).toBe(true);
  fireEvent.change(within(card).getByLabelText("Tambah penguji"), { target: { value: "Rani Contoh · CoE" } });
  fireEvent.click(add);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request.mock.calls[0][0]).toBe(mainWamAdminApi.testers);
  expect(JSON.parse((request.mock.calls[0][1] as { body: string }).body)).toEqual({ employeeId: people[0].id });
  expect(await within(card).findByText("Rani Contoh")).toBeTruthy();
  request.mockResolvedValueOnce({ message: "Penguji dihapus dari daftar.", data: { testers: [] } });
  fireEvent.click(within(card).getByRole("button", { name: "Hapus Sari Contoh dari penguji" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(request.mock.calls[1][0]).toBe(mainWamAdminApi.tester(people[1].id));
});

it("waits for the migration: nothing can be saved", () => {
  draw({ ...settings, migrated: false });
  // Plain words, no file name (audit R13, T-A01).
  expect(screen.getByText(/Pengaturan WAM 2026 menunggu pembaruan sistem\..*Hubungi tim CoE\./)).toBeTruthy();
  expect(screen.queryByText(/202611200001|migrasi/)).toBeNull();
  // The radios sit in a disabled fieldset.
  expect(screen.getByRole("radio", { name: /WAM 2026 \(uji\)/ }).matches(":disabled")).toBe(true);
  expect((screen.getByRole("switch", { name: "Absen QR" }) as HTMLInputElement).disabled).toBe(true);
});

it("shows Mode demo, off by default, and saves it on its own without touching the modules", async () => {
  request.mockResolvedValue({ message: "Mode demo menyala. Matikan sebelum acara.", data: { ...settings, moduleConfig: { ...settings.moduleConfig, demo: true } } });
  draw();
  const card = screen.getByRole("region", { name: "Mode demo" });
  expect(within(card).getByText(/Menampilkan semua layar dengan data contoh untuk dicoba\. Data nyata tidak diubah\. Matikan sebelum acara\./)).toBeTruthy();
  const toggle = within(card).getByRole("switch", { name: "Mode demo (data contoh)" }) as HTMLInputElement;
  expect(toggle.checked).toBe(false);
  fireEvent.click(toggle);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(JSON.parse((request.mock.calls[0][1] as { body: string }).body)).toEqual({ moduleConfig: { demo: true } });
  expect(await screen.findByText("Mode demo menyala. Matikan sebelum acara.")).toBeTruthy();
  // The saved modules still show as chosen, not as the demo draws them.
  expect((within(screen.getByRole("region", { name: "Modul" })).getByRole("switch", { name: "Mozaik" }) as HTMLInputElement).checked).toBe(false);
});

it("says who is panitia: Panitia WAM, apart from Pra WAM's (20 Nov 2026)", () => {
  draw();
  const card = screen.getByRole("region", { name: "Siapa panitia?" });
  expect(within(card).getByText("Atur di Panitia WAM. Panitia dan admin Pra WAM tidak otomatis menjadi panitia acara WAM. Penguji tambahan dipilih di sini.")).toBeTruthy();
  expect(within(card).getByRole("link", { name: /Buka Panitia WAM/ }).getAttribute("href")).toBe("/admin/wam2026/panitia");
});
