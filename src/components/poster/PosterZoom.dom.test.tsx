import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PosterZoom } from "./PosterZoom";

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("opens the card full screen, fitted first, then larger in steps, and closes again", () => {
  render(<PosterZoom format="post"><p>Kartu</p></PosterZoom>);
  // Drawn only while open.
  expect(screen.queryByText("Kartu")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Perbesar" }));
  const dialog = screen.getByRole("dialog", { name: "Kartu diperbesar" });
  const holder = () => screen.getByText("Kartu").parentElement as HTMLElement;
  const fitted = Number.parseFloat(holder().style.width);
  expect(screen.getByRole("button", { name: "Pas layar" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Perkecil" })).toHaveProperty("disabled", true);

  fireEvent.click(screen.getByRole("button", { name: "2×" }));
  expect(Number.parseFloat(holder().style.width)).toBe(fitted * 2);
  fireEvent.click(screen.getByRole("button", { name: "Perbesar lagi" }));
  expect(Number.parseFloat(holder().style.width)).toBe(fitted * 3);
  expect(screen.getByRole("button", { name: "Perbesar lagi" })).toHaveProperty("disabled", true);

  fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
  expect(dialog.isConnected).toBe(false);
  expect(screen.queryByText("Kartu")).toBeNull();
});
