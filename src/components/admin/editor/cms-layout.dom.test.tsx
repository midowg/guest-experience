import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { EventEditor } from "@/components/admin/editor/EventEditor";
import { editorMenu, openBlock } from "@/components/admin/editor/editor-test-helpers";

vi.setConfig({ testTimeout: 20000 });
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

/** A screen of the given width, as matchMedia reports it to the editor. */
function screenWidth(wide: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: wide && query.includes("72rem"), media: query, addEventListener() {}, removeEventListener() {} }));
}
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  window.scrollTo = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("on a wide screen opens the picked part's form inside the side menu, beside the preview", () => {
  screenWidth(true);
  render(<EventEditor event={createSeedEvent()} />);
  const menu = editorMenu();
  // The open part (Identitas) holds its form inside its own menu item.
  expect(within(menu).getByLabelText("Judul acara")).toBeTruthy();
  openBlock("Waktu acara");
  expect(within(menu).queryByLabelText("Judul acara")).toBeNull();
  expect(screen.getByRole("complementary", { name: "Pratinjau undangan" })).toBeTruthy();
  // No ☰ and no numbered chips: the menu is always there.
  expect(screen.queryByRole("button", { name: /menu bagian/ })).toBeNull();
});

it("on a phone lists the parts, and a part opens as a full sheet with Lihat pratinjau and Selesai", () => {
  screenWidth(false);
  render(<EventEditor event={createSeedEvent()} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByLabelText("Judul acara")).toBeNull();
  openBlock("Identitas & undangan");
  const sheet = screen.getByRole("dialog", { name: "Identitas & undangan" });
  expect(within(sheet).getByLabelText("Judul acara")).toBeTruthy();
  fireEvent.click(within(sheet).getByRole("button", { name: "Selesai" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  openBlock("Identitas & undangan");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Lihat pratinjau/ }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Lihat" }).getAttribute("aria-pressed")).toBe("true");
});

it("keeps its own layout for Kartu and E-Guide", () => {
  screenWidth(true);
  const { unmount } = render(<EventEditor event={{ ...createSeedEvent(), event_kind: "kartu" }} />);
  expect(document.querySelector("[data-cms]")).toBeNull();
  unmount();
  render(<EventEditor event={{ ...createSeedEvent(), event_kind: "eguide" }} />);
  expect(document.querySelector("[data-cms]")).toBeNull();
});
