import { afterEach, beforeAll, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { WamNav } from "./WamNav";
import { wamGroups, wamSections } from "./sections";

beforeAll(() => {
  // jsdom has no modal dialogs; enough of one for the drawer.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); window.localStorage.clear(); });

const menuHrefs = () => wamGroups().flatMap(group => group.sections.map(section => section.href));

it("lists the menu sections, marks the one you are on, and shows the reset count on Akun dan peran", () => {
  render(<WamNav current="akun" badges={{ reset: "2" }}><p>Isi halaman</p></WamNav>);
  const menu = screen.getByRole("navigation", { name: "Menu Admin WAM" });
  const links = within(menu).getAllByRole("link");
  expect(links.map(link => link.getAttribute("href"))).toEqual(menuHrefs());
  // Permintaan reset is a tab of Akun dan peran now, not a menu item.
  expect(within(menu).queryByRole("link", { name: /Permintaan reset/ })).toBeNull();
  const accounts = within(menu).getByRole("link", { name: /Akun dan peran/ });
  expect(accounts.getAttribute("aria-current")).toBe("page");
  expect(accounts.textContent).toContain("2 permintaan reset menunggu");
  expect(links.filter(link => link.getAttribute("aria-current") === "page")).toHaveLength(1);
  expect(within(menu).getByRole("button", { name: "Orang" })).toBeTruthy();
  expect(within(menu).queryByRole("link", { name: /Unit dan jabatan/ })).toBeNull();
  expect(screen.getByRole("main").textContent).toBe("Isi halaman");
});

it("marks Akun dan peran while its reset tab is open", () => {
  render(<WamNav current="reset"><p /></WamNav>);
  const menu = screen.getByRole("navigation", { name: "Menu Admin WAM" });
  expect(within(menu).getByRole("link", { name: /Akun dan peran/ }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("button", { name: "Menu Admin WAM" }).parentElement!.textContent).toContain("Akun dan peran");
});

it("ends the sidebar with the app (new tab), all events, super admin only for the super admin, and Keluar", () => {
  const { rerender } = render(<WamNav current="ringkasan"><p /></WamNav>);
  const app = screen.getByRole("link", { name: /Buka aplikasi WAM/ });
  expect(app.getAttribute("href")).toBe("/wam");
  expect(app.getAttribute("target")).toBe("_blank");
  expect(app.textContent).toContain("(tab baru)");
  expect(screen.getByRole("link", { name: "Semua acara Journey" }).getAttribute("href")).toBe("/admin");
  expect(screen.queryByRole("link", { name: "Super admin" })).toBeNull();
  expect(screen.getByRole("button", { name: "Keluar" })).toBeTruthy();
  rerender(<WamNav current="ringkasan" superAdmin><p /></WamNav>);
  expect(screen.getByRole("link", { name: "Super admin" }).getAttribute("href")).toBe("/admin/super");
});

it("on a phone, the hamburger opens the same menu as a drawer and gives focus back when it closes", () => {
  const { container } = render(<WamNav current="ruang"><p /></WamNav>);
  const burger = screen.getByRole("button", { name: "Menu Admin WAM" });
  expect(burger.parentElement!.textContent).toContain("Ruang dan denah");
  expect(burger.getAttribute("aria-expanded")).toBe("false");
  act(() => { fireEvent.click(burger); });
  expect(burger.getAttribute("aria-expanded")).toBe("true");
  const drawer = container.querySelector("dialog[open]") as HTMLDialogElement;
  const inside = within(within(drawer).getByRole("navigation")).getAllByRole("link").map(link => link.getAttribute("href"));
  expect(inside).toEqual(menuHrefs());
  act(() => { fireEvent.click(within(drawer).getByRole("button", { name: "Tutup menu" })); });
  expect(burger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(burger);
});

it("finds a page that is only a tab with the search", () => {
  render(<WamNav current="ringkasan"><p /></WamNav>);
  act(() => { fireEvent.keyDown(window, { key: "k", ctrlKey: true }); });
  const input = screen.getByRole("combobox");
  act(() => { fireEvent.change(input, { target: { value: "reset" } }); });
  const options = screen.getAllByRole("option");
  expect(options.map(option => option.getAttribute("href"))).toEqual([wamSections.find(section => section.key === "reset")!.href]);
});
