import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { EventEditor } from "./EventEditor";
import { CreateEventDialog } from "./CreateEventDialog";
import { ModuleSettings } from "./ModuleSettings";

vi.setConfig({ testTimeout: 20000 });
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("hides switched-off modules from a regular admin's editor", () => {
  render(<EventEditor event={createSeedEvent()} disabledModules={["team", "review", "personal", "bilingual"]} />);
  for (const title of ["Our Team", "Ulasan Google (opsional)", "Bahasa & terjemahan"]) expect(screen.queryByRole("button", { name: `Ubah ${title}` })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Ubah Identitas & undangan" }));
  expect(screen.getByRole("radio", { name: "Tautan umum" })).toBeTruthy();
  expect(screen.queryByRole("radio", { name: "Tautan per tamu" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Selesai" }));
  fireEvent.click(screen.getByRole("button", { name: "Ubah Urutan & tampilan bagian" }));
  expect(screen.queryByText("Our Team")).toBeNull();
});

it("keeps a module the event already uses, with a note", () => {
  render(<EventEditor event={createSeedEvent()} disabledModules={["rsvp"]} />);
  fireEvent.click(screen.getByRole("button", { name: "Ubah Penerimaan RSVP" }));
  expect(screen.getByText(/dinonaktifkan oleh super admin\. Acara ini sudah memakainya/)).toBeTruthy();
});

it("offers only allowed modules, languages, and invitation modes when creating", () => {
  render(<CreateEventDialog events={[]} onClose={() => {}} disabledModules={["team", "bilingual", "personal"]} />);
  fireEvent.click(screen.getByRole("button", { name: /Kunjungan klien/ }));
  expect(screen.queryByRole("radio", { name: /Dua bahasa/ })).toBeNull();
  expect(screen.queryByRole("radio", { name: /Tautan per tamu/ })).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Nama acara" }), { target: { value: "Kunjungan" } });
  fireEvent.change(screen.getByLabelText(/^Mulai/), { target: { value: "2026-12-01T10:00" } });
  fireEvent.click(screen.getByRole("button", { name: /Lanjut/ }));
  const modules = screen.getByRole("group", { name: "Bagian yang tampil di halaman tamu" });
  expect(within(modules).queryByText("Our Team")).toBeNull();
  expect(within(modules).getByText("Rundown")).toBeTruthy();
});

it("lets the super admin switch modules off and saves the list", async () => {
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify({ ok: true, data: JSON.parse(init!.body as string), message: "2 modul dinonaktifkan untuk admin biasa." }), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  render(<ModuleSettings initialDisabled={["review"]} migrated />);
  expect((screen.getByRole("switch", { name: "Ulasan Google boleh dipakai admin" }) as HTMLInputElement).checked).toBe(false);
  const save = screen.getByRole("button", { name: /Simpan pengaturan modul/ }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.click(screen.getByRole("switch", { name: "Our Team boleh dipakai admin" }));
  expect(save.disabled).toBe(false);
  fireEvent.click(save);
  expect(await screen.findByText("2 modul dinonaktifkan untuk admin biasa.")).toBeTruthy();
  expect(fetch.mock.calls[0][0]).toBe("/api/admin/modules");
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).disabled.sort()).toEqual(["review", "team"]);
});
