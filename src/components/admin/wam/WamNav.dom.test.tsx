import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { WamNav } from "./WamNav";
import { wamSections } from "./sections";

afterEach(cleanup);

it("lists every section in one tap, marks the one you are on, shows its count, and opens the app", () => {
  render(<WamNav current="akun" badges={{ reset: "2" }} />);
  const menu = screen.getByRole("navigation", { name: "Bagian admin WAM" });
  const links = within(menu).getAllByRole("link");
  // Every section, then the app; no dropdown to open first.
  expect(links.map(link => link.getAttribute("href"))).toEqual([...wamSections.map(section => section.href), "/wam"]);
  expect(within(menu).queryByRole("button")).toBeNull();
  expect(within(menu).getByRole("link", { name: /Akun dan peran/ }).getAttribute("aria-current")).toBe("page");
  expect(links.filter(link => link.getAttribute("aria-current") === "page")).toHaveLength(1);
  expect(within(menu).getByRole("link", { name: /Permintaan reset password/ }).textContent).toContain("2 menunggu");
  expect(within(menu).getByText("Orang")).toBeTruthy();
  expect(within(menu).queryByRole("link", { name: /Unit dan jabatan/ })).toBeNull();
  const app = within(menu).getByRole("link", { name: /Buka aplikasi WAM/ });
  expect(app.getAttribute("target")).toBe("_blank");
  expect(app.textContent).toContain("(tab baru)");
});
