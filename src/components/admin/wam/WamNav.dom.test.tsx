import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { WamNav } from "./WamNav";

afterEach(cleanup);

it("names the section you are on, lists every section with its count, and opens the app", () => {
  render(<WamNav current="akun" badges={{ reset: "2" }} />);
  const trigger = screen.getByRole("button", { name: /Akun dan peran/ });
  fireEvent.click(trigger);
  const list = document.getElementById("event-pages")!;
  expect(within(list).getByRole("link", { name: /Akun dan peran/ }).getAttribute("aria-current")).toBe("page");
  expect(within(list).getByRole("link", { name: /Permintaan reset password/ }).textContent).toContain("2");
  expect(within(list).getByRole("link", { name: /Ruang dan denah/ }).getAttribute("href")).toBe("/admin/wam/ruang");
  expect(screen.getByRole("navigation", { name: "Bagian admin WAM" })).toBeTruthy();
  expect(screen.getByRole("link", { name: /Buka aplikasi WAM/ }).getAttribute("href")).toBe("/wam");
});
