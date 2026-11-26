import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { coffeeAdminPath } from "@/lib/routes";
import { CoffeeAdminApp } from "./CoffeeAdminApp";
import { createSampleServer } from "./sample";

const sheetCss = readFileSync(join(process.cwd(), "src/components/coffee-admin/coffee-admin.module.css"), "utf8");

/*
 * Catat manual as the real page opens it (26 Nov 2026): the address decides the section
 * (routing "history", what /admin/coffee uses), and the person is the super admin of the shared
 * sign-in, who has no employee row. One clear button in Antrean's head, on the phone too.
 * A make-believe server ("Contoh ..." people).
 */
const NOW = "2026-11-25T03:00:00.000Z";
const place = vi.hoisted(() => ({ path: "/admin/coffee" }));
vi.mock("next/navigation", () => ({ usePathname: () => place.path }));

async function open(props: { openManual?: boolean } = {}) {
  const server = createSampleServer();
  const api = { ...server.api, manual: vi.fn(server.api.manual), people: vi.fn(server.api.people) };
  render(<CoffeeAdminApp view="antrean" initial={{ queue: await server.api.queue() }} now={NOW} superAdmin api={api} push={null} {...props} />);
  return { api };
}

beforeEach(() => { place.path = coffeeAdminPath.home; window.history.replaceState({}, "", coffeeAdminPath.home); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(NOW)); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("shows one primary Catat manual button in Antrean's head, on every width, and none in the bottom menu", async () => {
  await open();
  const buttons = screen.getAllByRole("button", { name: "Catat manual" });
  expect(buttons).toHaveLength(1);
  expect(buttons[0].closest("header")!.querySelector("h1")!.textContent).toBe("Antrean");
  // A primary button whose words stay white: this area's reset makes a button take the page's ink, which hid them on the blue.
  expect(buttons[0].className).toMatch(/buttonPrimary/);
  expect(buttons[0].className).toMatch(/onPrimary/);
  expect(sheetCss).toMatch(/\.root \.onPrimary \{ color: var\(--cs-on-primary\); \}/);
  expect(buttons[0].className).not.toMatch(/desktopOnly/);
  expect(within(screen.getByRole("navigation", { name: "Menu pengelola (ponsel)" })).queryByText(/Catat/)).toBeNull();
});

it("lets the super admin (no employee row) record a drink: the people load, the record is saved under Super admin", async () => {
  const { api } = await open();
  fireEvent.click(screen.getByRole("button", { name: "Catat manual" }));
  const sheet = await screen.findByRole("dialog", { name: "Catat manual" });
  expect(sheet.textContent).toMatch(/Dicatat oleh Super admin/);
  await waitFor(() => expect(api.people).toHaveBeenCalledWith("2026-11"));
  const input = within(sheet).getByRole("combobox", { name: "Nama karyawan" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "arief" } });
  fireEvent.mouseDown(await screen.findByRole("option", { name: /Arief Hidayat/ }));
  fireEvent.click(within(sheet).getByRole("button", { name: /Simpan/ }));
  await waitFor(() => expect(api.manual).toHaveBeenCalledTimes(1));
  expect(api.manual.mock.calls[0][0]).toMatchObject({ kind: "klaim", date: "2026-11-25" });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Catat manual" })).toBeNull());
  expect(screen.getByText("Dicatat manual", { selector: "strong" })).toBeTruthy();
});

it("says why the names are missing when the people cannot be read, with a way to try again", async () => {
  const { api } = await open();
  api.people.mockRejectedValueOnce(new Error("Server belum dapat memberikan jawaban."));
  fireEvent.click(screen.getByRole("button", { name: "Catat manual" }));
  const sheet = await screen.findByRole("dialog", { name: "Catat manual" });
  await waitFor(() => expect(sheet.textContent).toMatch(/Daftar karyawan belum bisa dimuat\./));
  fireEvent.click(within(sheet).getByRole("button", { name: /Coba lagi/ }));
  await waitFor(() => expect(api.people).toHaveBeenCalledTimes(2));
});

it("opens the sheet when the address asks for it (?catat=1), and tidies the address", async () => {
  window.history.replaceState({}, "", coffeeAdminPath.manual);
  await open({ openManual: true });
  expect(await screen.findByRole("dialog", { name: "Catat manual" })).toBeTruthy();
  expect(window.location.search).toBe("");
});
