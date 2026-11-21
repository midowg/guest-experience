import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HomeStyleSettings } from "./HomeStyleSettings";
import { isHomeStyle } from "@/lib/home-style";

let calls: { url: string; body: unknown }[] = [];
beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push({ url, body });
    return new Response(JSON.stringify({ ok: true, data: body, message: "Halaman utama sekarang memakai tampilan Lampu." }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("knows only the two looks", () => {
  expect(isHomeStyle("kartu")).toBe(true);
  expect(isHomeStyle("lampu")).toBe(true);
  expect(isHomeStyle("bento")).toBe(false);
});

it("saves the picked look at once and marks it as used", async () => {
  render(<HomeStyleSettings initial="kartu" migrated />);
  expect(screen.getByRole("radio", { name: /Kartu 3D/ }).getAttribute("aria-checked")).toBe("true");
  fireEvent.click(screen.getByRole("radio", { name: /Lampu/ }));
  expect(await screen.findByText(/sekarang memakai tampilan Lampu/)).toBeTruthy();
  expect(calls).toEqual([{ url: "/api/admin/home-style", body: { style: "lampu" } }]);
  expect(screen.getByRole("radio", { name: /Lampu/ }).getAttribute("aria-checked")).toBe("true");
});

it("waits for the migration before allowing a change", () => {
  render(<HomeStyleSettings initial="kartu" migrated={false} />);
  expect(screen.getByText(/menunggu migrasi/)).toBeTruthy();
  for (const option of screen.getAllByRole("radio")) expect((option as HTMLButtonElement).disabled).toBe(true);
});
