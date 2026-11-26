import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AdminApiError } from "@/components/admin/shared/api";
import type { SettingsData } from "./api";
import { createSampleServer } from "./sample";
import { SettingsView } from "./SettingsView";
import css from "./coffee-admin.module.css";

/*
 * Pengaturan (audit F1: no test; F1-09, F1-14, F1-18): the quotas between 0 and 60, Simpan only
 * with a change, the server's refusal, a failed load with Coba lagi, the question before a quota
 * of 0, and the form staying in place after saving. Made-up people only.
 */
async function open(change: (api: ReturnType<typeof createSampleServer>["api"]) => object = () => ({})) {
  const server = createSampleServer();
  const api = { ...server.api, saveSettings: vi.fn(server.api.saveSettings), ...change(server.api) } as typeof server.api & { saveSettings: ReturnType<typeof vi.fn> };
  const first = await server.api.settings();
  const onSaved = vi.fn();
  let push!: (data: SettingsData) => void;
  function Holder() {
    const [data, setData] = useState<SettingsData>(first);
    push = setData;
    return <div className={css.root}><SettingsView api={api} data={data} error="" onRetry={() => undefined} onSaved={(saved, message) => { setData(saved); onSaved(saved, message); }} /></div>;
  }
  render(<Holder />);
  return { api, onSaved, push: (data: SettingsData) => push(data), first };
}
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const type = (name: string, value: string) => fireEvent.change(field(name), { target: { value } });
const save = () => screen.getByRole("button", { name: /Simpan jatah|Menyimpan/ }) as HTMLButtonElement;

afterEach(cleanup);

it("shows the quotas, the holders and the rooms; Simpan waits for a change", async () => {
  await open();
  expect([field("Karyawan").value, field("Tim GA").value, field("Intern").value]).toEqual(["4", "2", "2"]);
  expect(save().disabled).toBe(true);
  expect(screen.getByText("Tersimpan.")).toBeTruthy();
  expect(screen.getByText("Dewi Lestari (contoh)")).toBeTruthy();
  expect(screen.getByText("Vasuki Room")).toBeTruthy();
  type("Karyawan", "5");
  expect(save().disabled).toBe(false);
  expect(screen.getByText("Belum disimpan.")).toBeTruthy();
  type("Karyawan", "4");
  expect(save().disabled).toBe(true);
});

it("holds back anything outside 0 to 60, under its own field", async () => {
  const { api } = await open();
  for (const wrong of ["61", "", "-1", "1.5"]) {
    type("Tim GA", wrong);
    expect(field("Tim GA").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Isi angka 0 sampai 60.")).toBeTruthy();
    expect(save().disabled).toBe(true);
  }
  fireEvent.submit(save().closest("form")!);
  expect(api.saveSettings).not.toHaveBeenCalled();
});

it("saves, says so, and keeps the form and the focus where they were", async () => {
  const { api, onSaved } = await open();
  type("Intern", "3");
  const input = field("Intern");
  input.focus();
  fireEvent.click(save());
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ settings: { karyawan: 4, ga: 2, intern: 3 } }), "Jatah disimpan."));
  expect(api.saveSettings).toHaveBeenCalledWith({ karyawan: 4, ga: 2, intern: 3 });
  // The same input element (the form was not put up anew), still holding the focus.
  expect(field("Intern")).toBe(input);
  expect(document.activeElement).toBe(input);
  expect(field("Intern").value).toBe("3");
  await waitFor(() => expect(save().disabled).toBe(true));
});

it("asks before a quota becomes 0, and saves nothing on Kembali", async () => {
  const { api } = await open();
  type("Karyawan", "0");
  fireEvent.click(save());
  const dialog = screen.getByRole("dialog", { name: "Simpan jatah 0 untuk Karyawan?" });
  expect(dialog.textContent).toMatch(/tidak bisa mengajukan klaim/);
  expect(api.saveSettings).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Kembali" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(api.saveSettings).not.toHaveBeenCalled();
  expect(field("Karyawan").value).toBe("0");
  fireEvent.click(save());
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Simpan jatah" }));
  await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ karyawan: 0, ga: 2, intern: 2 }));
  // Already 0: changing another quota does not ask again.
  await waitFor(() => expect(save().disabled).toBe(true));
  type("Intern", "1");
  fireEvent.click(save());
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() => expect(api.saveSettings).toHaveBeenCalledTimes(2));
});

it("shows the server's refusal and keeps what was typed", async () => {
  await open(() => ({ saveSettings: vi.fn(async () => { throw new AdminApiError("Periksa kembali isian formulir.", { ga: ["Jatah Tim GA paling banyak 60."] }, 422); }) }));
  type("Tim GA", "9");
  fireEvent.click(save());
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Periksa kembali isian formulir."));
  expect(screen.getByText("Jatah Tim GA paling banyak 60.")).toBeTruthy();
  expect(field("Tim GA").value).toBe("9");
  expect(save().disabled).toBe(false);
});

it("takes quotas read again from the server, unless something typed here still waits", async () => {
  const { push, first } = await open();
  push({ ...first, settings: { karyawan: 6, ga: 2, intern: 2 } });
  await waitFor(() => expect(field("Karyawan").value).toBe("6"));
  type("Intern", "5");
  push({ ...first, settings: { karyawan: 7, ga: 2, intern: 2 } });
  await waitFor(() => expect(screen.getByText("Belum disimpan.")).toBeTruthy());
  expect([field("Karyawan").value, field("Intern").value]).toEqual(["6", "5"]);
});

it("says so when it cannot be loaded, with Coba lagi, and a skeleton while it loads", () => {
  const onRetry = vi.fn();
  const api = createSampleServer().api;
  const { rerender } = render(<div className={css.root}><SettingsView api={api} data={null} error="" onRetry={onRetry} onSaved={() => undefined} /></div>);
  expect(screen.getByRole("heading", { name: "Jatah per bulan" }).parentElement!.getAttribute("aria-busy")).toBe("true");
  expect(screen.queryByRole("alert")).toBeNull();
  rerender(<div className={css.root}><SettingsView api={api} data={null} error="Layanan belum dapat memproses permintaan." onRetry={onRetry} onSaved={() => undefined} /></div>);
  expect(screen.getByRole("alert").textContent).toMatch(/Pengaturan belum bisa dimuat\. Layanan belum dapat memproses permintaan\./);
  fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

/* ---------- PIN GA (audit F3-04, 26 Nov 2026) */

it("sets the PIN GA: four digits only, said as set afterwards, and the field forgets what was typed", async () => {
  const { api, onSaved } = await open(real => ({ saveGaPin: vi.fn(real.saveGaPin) }));
  const pin = () => screen.getByLabelText("PIN") as HTMLInputElement;
  const panel = () => within(screen.getByRole("heading", { level: 2, name: "PIN GA" }).closest("section")!);
  expect(panel().getByRole("status").textContent).toBe("Belum diatur");
  expect(pin().type).toBe("password");
  expect(pin().getAttribute("inputmode")).toBe("numeric");
  expect(pin().getAttribute("autocomplete")).toBe("off");
  // Letters never get in, and a fifth digit is not taken.
  fireEvent.change(pin(), { target: { value: "12ab345" } });
  expect(pin().value).toBe("1234");
  fireEvent.change(pin(), { target: { value: "12" } });
  fireEvent.click(panel().getByRole("button", { name: "Simpan PIN" }));
  expect(panel().getByText("Isi PIN 4 angka.")).toBeTruthy();
  expect(pin().getAttribute("aria-invalid")).toBe("true");
  expect((api as unknown as { saveGaPin: ReturnType<typeof vi.fn> }).saveGaPin).not.toHaveBeenCalled();
  fireEvent.change(pin(), { target: { value: "4821" } });
  fireEvent.click(panel().getByRole("button", { name: "Simpan PIN" }));
  await waitFor(() => expect(panel().getByRole("status").textContent).toBe("Sudah diatur"));
  expect((api as unknown as { saveGaPin: ReturnType<typeof vi.fn> }).saveGaPin).toHaveBeenCalledWith("4821");
  expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ gaPin: true }), "PIN GA disimpan. Beri tahu petugas GA.");
  // Nothing of the PIN stays on the page; the same form now replaces it.
  expect((screen.getByLabelText("PIN baru") as HTMLInputElement).value).toBe("");
  expect(document.body.innerHTML).not.toContain("4821");
  expect(panel().getByRole("button", { name: "Ganti PIN" })).toBeTruthy();
  // Saving the PIN left the quotas' form alone.
  expect(field("Karyawan").value).toBe("4");
});

it("says so when the PIN could not be saved, and keeps what was typed for another try", async () => {
  await open(() => ({ saveGaPin: vi.fn(async () => { throw new AdminApiError("WG Coffee menunggu migrasi 202612010001_coffee.sql.", undefined, 503); }) }));
  fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "4821" } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan PIN" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/menunggu migrasi/);
  expect((screen.getByLabelText("PIN") as HTMLInputElement).value).toBe("4821");
  expect(screen.getByText("Belum diatur")).toBeTruthy();
});
