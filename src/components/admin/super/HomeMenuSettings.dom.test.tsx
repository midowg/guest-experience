import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HomeMenuSettings } from "./HomeMenuSettings";
import { defaultHomeMenu } from "@/lib/home-menu";

let calls: { url: string; body: { menu: typeof defaultHomeMenu } }[] = [];
beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push({ url, body });
    return new Response(JSON.stringify({ ok: true, data: body, message: "Menu disimpan: 4 aplikasi tampil di halaman utama." }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("hides, reorders and renames apps, then saves the whole menu", async () => {
  render(<HomeMenuSettings initial={defaultHomeMenu} migrated />);
  const save = screen.getByRole("button", { name: /Simpan menu/ }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.click(screen.getByRole("switch", { name: "Signage tampil di halaman utama" }));
  fireEvent.click(screen.getByRole("button", { name: "Naikkan Journey Admin" }));
  fireEvent.change(screen.getAllByLabelText("Nama")[0], { target: { value: "WAM" } });
  expect(screen.getByText("Ada perubahan yang belum disimpan.")).toBeTruthy();
  fireEvent.click(save);
  expect(await screen.findByText(/Menu disimpan/)).toBeTruthy();
  const sent = calls[0].body.menu;
  expect(calls[0].url).toBe("/api/admin/home-style");
  expect(sent.map(item => item.app)).toEqual(["wam", "wlm", "booking", "hr", "admin", "signage"]);
  expect(sent.find(item => item.app === "signage")!.shown).toBe(false);
  expect(sent[0].name).toBe("WAM");
});

it("refuses to save an empty name or a menu with every app hidden", () => {
  render(<HomeMenuSettings initial={defaultHomeMenu} migrated />);
  fireEvent.change(screen.getAllByLabelText("Nama")[1], { target: { value: "" } });
  expect(screen.getByRole("alert").textContent).toMatch(/Isi nama/);
  expect((screen.getByRole("button", { name: /Simpan menu/ }) as HTMLButtonElement).disabled).toBe(true);
});

it("waits for the migration", () => {
  render(<HomeMenuSettings initial={defaultHomeMenu} migrated={false} />);
  expect(screen.getByText(/menunggu migrasi/)).toBeTruthy();
  for (const toggle of screen.getAllByRole("switch")) expect((toggle as HTMLInputElement).disabled).toBe(true);
});
