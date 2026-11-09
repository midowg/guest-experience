import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeSwitch } from "./ThemeSwitch";

afterEach(() => cleanup());

it("lists the three themes as rows and switches the app's theme at once", () => {
  document.body.innerHTML = "";
  const app = document.createElement("div");
  app.setAttribute("data-wam-theme", "light");
  document.body.appendChild(app);
  render(<ThemeSwitch initial="light" />, { container: app });
  const rows = screen.getAllByRole("radio");
  expect(rows.map(row => row.closest("label")?.querySelector("strong")?.textContent)).toEqual(["Terang", "Gelap", "Ikuti perangkat"]);
  expect((screen.getByRole("radio", { name: /Terang/ }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("radio", { name: /Gelap/ }));
  expect((screen.getByRole("radio", { name: /Gelap/ }) as HTMLInputElement).checked).toBe(true);
  expect(app.getAttribute("data-wam-theme")).toBe("dark");
});
