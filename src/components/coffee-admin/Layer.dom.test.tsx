import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Layer } from "./Layer";

/*
 * The dialog and sheet frame (audit F1: no test at all, F1-10): Escape, Tab kept inside, the focus
 * back where it came from, the page behind locked and inert, two layers where only the top one
 * answers, and the phone's back gesture.
 */
function Stage({ inner = false }: { inner?: boolean }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState(false);
  return (
    <main>
      <button type="button" onClick={() => setOpen(true)}>Buka</button>
      <a href="#lain">Tautan lain</a>
      {open && (
        <Layer onClose={() => inner ? setQuestion(true) : setOpen(false)} labelledBy="judul">
          <h2 id="judul">Lapisan</h2>
          <button type="button">Pertama</button>
          <input aria-label="Isian" data-autofocus />
          <button type="button">Terakhir</button>
          {question && (
            <Layer onClose={() => setQuestion(false)} labelledBy="tanya">
              <h2 id="tanya">Buang?</h2>
              <button type="button" onClick={() => { setQuestion(false); setOpen(false); }}>Buang</button>
            </Layer>
          )}
        </Layer>
      )}
    </main>
  );
}
const phone = (on: boolean) => vi.stubGlobal("matchMedia", (query: string) => ({ matches: on, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
const key = (name: string, more: object = {}) => fireEvent.keyDown(document.activeElement ?? document.body, { key: name, ...more });
const tick = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, ""); });

it("opens on the marked field, keeps Tab inside, closes on Escape and gives the focus back", () => {
  phone(false);
  render(<Stage />);
  const opener = screen.getByRole("button", { name: "Buka" });
  opener.focus();
  fireEvent.click(opener);
  const dialog = screen.getByRole("dialog", { name: "Lapisan" });
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  expect(document.activeElement).toBe(screen.getByLabelText("Isian"));
  screen.getByRole("button", { name: "Terakhir" }).focus();
  key("Tab");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Pertama" }));
  key("Tab", { shiftKey: true });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Terakhir" }));
  // Focus that got out is pulled back in.
  (document.activeElement as HTMLElement).blur();
  fireEvent.keyDown(document.body, { key: "Tab" });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Pertama" }));
  key("Escape");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(opener);
});

it("locks the page behind: no scroll, everything else inert, and all of it given back", () => {
  phone(false);
  const { container } = render(<Stage />);
  document.body.style.overflow = "auto";
  fireEvent.click(screen.getByRole("button", { name: "Buka" }));
  expect(document.body.style.overflow).toBe("hidden");
  expect(container.hasAttribute("inert")).toBe(true);
  expect(screen.getByRole("dialog").closest("[inert]")).toBeNull();
  key("Escape");
  expect(document.body.style.overflow).toBe("auto");
  expect(container.hasAttribute("inert")).toBe(false);
  expect(document.querySelectorAll("[inert]")).toHaveLength(0);
  document.body.style.overflow = "";
});

it("closes when the scrim is pressed, not when the panel is", () => {
  phone(false);
  render(<Stage />);
  fireEvent.click(screen.getByRole("button", { name: "Buka" }));
  fireEvent.mouseDown(screen.getByRole("dialog"));
  expect(screen.queryByRole("dialog")).not.toBeNull();
  fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("with a layer over a layer, only the one on top answers Escape, and the one under it is inert meanwhile", () => {
  phone(false);
  render(<Stage inner />);
  fireEvent.click(screen.getByRole("button", { name: "Buka" }));
  key("Escape"); // the sheet asks first
  const question = screen.getByRole("dialog", { name: "Buang?" });
  expect(screen.getByText("Lapisan").closest("[inert]")).not.toBeNull();
  expect(question.closest("[inert]")).toBeNull();
  key("Escape"); // closes the question only
  expect(screen.queryByRole("dialog", { name: "Buang?" })).toBeNull();
  expect(screen.getByRole("dialog", { name: "Lapisan" }).closest("[inert]")).toBeNull();
  key("Escape");
  fireEvent.click(screen.getByRole("button", { name: "Buang" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.querySelectorAll("[inert]")).toHaveLength(0);
});

it("on a phone the back gesture closes the layer instead of leaving the page", async () => {
  phone(true);
  render(<Stage />);
  const before = window.history.length;
  fireEvent.click(screen.getByRole("button", { name: "Buka" }));
  expect(window.history.state?.coffeeLayer).toBe(true);
  expect(window.history.length).toBe(before + 1);
  await act(async () => { window.history.back(); await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(window.history.state?.coffeeLayer).toBeUndefined();
});

it("on a phone a layer that asks first stays open after the back gesture, and keeps its history entry", async () => {
  phone(true);
  render(<Stage inner />);
  fireEvent.click(screen.getByRole("button", { name: "Buka" }));
  await act(async () => { window.history.back(); await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(screen.getByRole("dialog", { name: "Buang?" })).toBeTruthy();
  expect(screen.getByRole("dialog", { name: "Lapisan" })).toBeTruthy();
  await tick();
  expect(window.history.state?.coffeeLayer).toBe(true);
});

it("on a wide screen going back closes the layer too", async () => {
  phone(false);
  window.history.pushState({}, "", "#satu");
  render(<Stage />);
  fireEvent.click(screen.getByRole("button", { name: "Buka" }));
  await act(async () => { window.history.back(); await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(screen.queryByRole("dialog")).toBeNull();
});
