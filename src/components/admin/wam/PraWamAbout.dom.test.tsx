import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { About } from "@/lib/pra-wam/about";

const request = vi.fn();
vi.mock("@/components/admin/shared/api", async importOriginal => ({ ...(await importOriginal<object>()), adminRequest: (...args: unknown[]) => request(...args) }));
const { PraWamAbout } = await import("./PraWamAbout");

afterEach(() => { cleanup(); request.mockReset(); });

const DEFAULT_ABOUT: About = { title: "Apa itu WAM?", summary: "Pertemuan tahunan Werkudara.", body: "WAM adalah pertemuan tahunan.", points: [] };

it("saves from the header's Simpan once something changed, and previews the card as typed", async () => {
  const state = { about: DEFAULT_ABOUT, custom: false, updatedAt: null, migrated: true };
  request.mockResolvedValue({ message: "Tersimpan.", data: { ...state, about: { ...DEFAULT_ABOUT, title: "WAM itu apa" }, custom: true, updatedAt: "2026-11-05T03:00:00Z" } });
  render(<PraWamAbout initial={state} crumbs={["Admin WAM", "Apa itu WAM"]} title="Apa itu WAM" />);
  expect(screen.getByRole("heading", { level: 1, name: "Apa itu WAM" })).toBeTruthy();
  expect(screen.getByRole("link", { name: /Lihat di Beranda/ }).getAttribute("href")).toBe("/wam");
  const save = screen.getByRole("button", { name: "Simpan" }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Judul"), { target: { value: "WAM itu apa" } });
  expect(screen.getAllByText("WAM itu apa").length).toBeGreaterThan(0);
  expect(save.disabled).toBe(false);
  fireEvent.click(save);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(JSON.parse((request.mock.calls[0][1] as { body: string }).body)).toMatchObject({ title: "WAM itu apa" });
  expect(await screen.findByText("Tersimpan.")).toBeTruthy();
});
