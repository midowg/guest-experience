import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { BlockChips } from "@/components/admin/editor/BlockChips";

const chips = [
  { id: "agenda", title: "Rundown", short: "Rundown" },
  { id: "venue", title: "Lokasi", short: "Lokasi" },
  { id: "rsvp", title: "Penerimaan RSVP", short: "RSVP", status: "todo" as const, statusLabel: "Perlu dilengkapi" },
];

/** jsdom has no layout: the visible row reports `room`, the hidden copy with every name `need`. */
function layout(room: number, need: number) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) { return this.getAttribute("aria-label") === "Modul aktif" ? room : 0; });
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) { return this.getAttribute("aria-hidden") === "true" ? need : 0; });
}
const shown = () => within(screen.getByRole("list", { name: "Modul aktif" })).getAllByRole("button").map(chip => chip.textContent);

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("shows every name when they fit on one row", () => {
  layout(400, 300);
  render(<BlockChips chips={chips} current="venue" onOpen={() => {}} />);
  expect(shown()).toEqual(["1Rundown", "2Lokasi", "3RSVP"]);
});

it("shows numbers only when the names do not fit, the open module keeping its name", () => {
  layout(200, 300);
  render(<BlockChips chips={chips} current="venue" onOpen={() => {}} />);
  expect(shown()).toEqual(["1", "2Lokasi", "3"]);
  // The full name and any status stay in the accessible name.
  expect(screen.getByRole("button", { name: "Modul 3: Penerimaan RSVP, perlu dilengkapi" })).toBeTruthy();
});
