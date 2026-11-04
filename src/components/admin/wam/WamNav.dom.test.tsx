import { afterEach, beforeAll, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { WamNav } from "./WamNav";
import { wamSections } from "./sections";

beforeAll(() => {
  // jsdom has no modal dialogs; enough of one for the drawer.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);

it("lists every section in one tap, marks the one you are on, shows its count, and opens the app", () => {
  render(<WamNav current="akun" badges={{ reset: "2" }} />);
  const menu = screen.getByRole("navigation", { name: "Bagian admin WAM" });
  // The sidebar list (the drawer stays empty until opened): every section, then the app.
  const links = within(menu).getAllByRole("link");
  expect(links.map(link => link.getAttribute("href"))).toEqual([...wamSections.map(section => section.href), "/wam"]);
  expect(within(menu).getByRole("link", { name: /Akun dan peran/ }).getAttribute("aria-current")).toBe("page");
  expect(links.filter(link => link.getAttribute("aria-current") === "page")).toHaveLength(1);
  expect(within(menu).getByRole("link", { name: /Permintaan reset password/ }).textContent).toContain("2 menunggu");
  expect(within(menu).getByText("Orang")).toBeTruthy();
  expect(within(menu).queryByRole("link", { name: /Unit dan jabatan/ })).toBeNull();
  const app = within(menu).getByRole("link", { name: /Buka aplikasi WAM/ });
  expect(app.getAttribute("target")).toBe("_blank");
  expect(app.textContent).toContain("(tab baru)");
});

it("on a phone, the hamburger names the current section and opens the same list as a drawer", () => {
  const { container } = render(<WamNav current="ruang" />);
  const burger = screen.getByRole("button", { name: /Menu admin WAM/ });
  expect(burger.textContent).toContain("Ruang dan denah");
  expect(burger.getAttribute("aria-expanded")).toBe("false");
  act(() => { fireEvent.click(burger); });
  expect(burger.getAttribute("aria-expanded")).toBe("true");
  const drawer = container.querySelector("dialog")!;
  const inside = within(drawer).getAllByRole("link").map(link => link.getAttribute("href"));
  expect(inside).toEqual([...wamSections.map(section => section.href), "/wam"]);
  act(() => { fireEvent.click(within(drawer).getByRole("button", { name: "Tutup menu" })); });
  expect(burger.getAttribute("aria-expanded")).toBe("false");
});
