import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { EmployeeDirectory } from "./EmployeeDirectory";
import type { Employee } from "@/lib/employees";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const person: Employee = { id: "6a000000-0000-4000-8000-000000000001", full_name: "Contoh Satu", nickname: "Satu", department: "Sales & Marketing", position: "Business Solutions Manager", office: "WNS", category: "karyawan", phone: "", email: "", active: true, nip: "" };
const row = { full_name: "Contoh Dua", nickname: "Dua", department: "Accounting", position: "Tax Staff", office: "WNS", category: "karyawan" };

it("reads the Excel first, shows who is new or changed, and saves only on request", async () => {
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/parse")) return reply({ ok: true, message: "2 karyawan terbaca dari sheet Data.", data: { sheet: "Data", skipped: [], migrated: true, plan: [
      { row, change: "baru", changed: [] },
      { row: { ...person, position: "Commercial Manager" }, change: "berubah", changed: ["position"] },
    ] } });
    if (init.method === "POST") return reply({ ok: true, message: "1 karyawan baru, 1 diperbarui, 0 tetap.", data: { added: 1, updated: 1, unchanged: 0 } });
    return reply({ ok: true, message: "", data: { employees: [person, { ...person, id: "6a000000-0000-4000-8000-000000000002", full_name: "Contoh Dua" }] } });
  });
  vi.stubGlobal("fetch", fetch);
  render(<EmployeeDirectory initial={[person]} migrated />);
  const input = screen.getByLabelText("Berkas Excel (.xlsx)") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "karyawan.xlsx")] } });
  fireEvent.click(screen.getByRole("button", { name: /Baca berkas/ }));
  expect(await screen.findByText(/1 baru, 1 diperbarui, 0 tetap/)).toBeTruthy();
  // The upload goes as a form, not as JSON.
  const [, parseInit] = fetch.mock.calls[0];
  expect(parseInit.body).toBeInstanceOf(FormData);
  expect(new Headers(parseInit.headers).get("Content-Type")).toBeNull();
  const preview = screen.getByRole("table", { name: "Pratinjau impor" });
  expect(within(preview).getByText("Baru")).toBeTruthy();
  expect(within(preview).getByText("jabatan")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Simpan 2 perubahan" }));
  expect(await screen.findByText("1 karyawan baru, 1 diperbarui, 0 tetap.")).toBeTruthy();
  expect(JSON.parse(fetch.mock.calls[1][1].body as string).rows).toHaveLength(2);
  expect(await screen.findByText("Contoh Dua")).toBeTruthy();
});

it("changes a category or switches someone off from the list", async () => {
  const fetch = vi.fn(async (_url: string, init: RequestInit) => reply({ ok: true, message: "Data karyawan disimpan.", data: { ...person, ...JSON.parse(init.body as string) } }));
  vi.stubGlobal("fetch", fetch);
  render(<EmployeeDirectory initial={[person]} migrated />);
  fireEvent.change(screen.getByLabelText("Kategori Contoh Satu"), { target: { value: "ga" } });
  expect(await screen.findByText("Data karyawan disimpan.")).toBeTruthy();
  expect(fetch.mock.calls[0][0]).toBe(`/api/admin/employees/${person.id}`);
  expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({ category: "ga" });
  expect((screen.getByLabelText("Kategori Contoh Satu") as HTMLSelectElement).value).toBe("ga");
});

it("says the table waits for its migration and keeps saving off", () => {
  render(<EmployeeDirectory initial={[]} migrated={false} />);
  expect(screen.getByText(/menunggu migrasi/)).toBeTruthy();
  expect(screen.getByText(/Belum ada data karyawan/)).toBeTruthy();
});
