import { afterEach, beforeEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SettingsItem } from "./SettingsItem";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  history.replaceState(null, "", "/wam/settings");
});
afterEach(() => cleanup());

const item = () => render(<SettingsItem id="password" icon={<span />} title="Ganti password" summary="Ganti password akunmu"><p>Isi formulir</p></SettingsItem>);

it("is a short row until tapped, then shows its details in a sheet and puts #id in the address", () => {
  item();
  expect(screen.queryByText("Isi formulir")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Ganti password/ }));
  expect(location.hash).toBe("#password");
  expect(screen.getByRole("dialog", { name: "Ganti password" })).toBeTruthy();
  expect(screen.getByText("Isi formulir")).toBeTruthy();
});

it("opens from a link that ends in #id, and closing drops the hash without leaving", () => {
  history.replaceState(null, "", "/wam/settings#password");
  item();
  expect(screen.getByText("Isi formulir")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
  expect(location.hash).toBe("");
  expect(location.pathname).toBe("/wam/settings");
  expect(screen.queryByText("Isi formulir")).toBeNull();
});
