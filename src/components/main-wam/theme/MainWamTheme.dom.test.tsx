import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MainWamTheme } from "./MainWamTheme";

// next/font only runs inside Next's compiler.
vi.mock("./font", () => ({ mainWamFontVars: "font-jakarta" }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("MainWamTheme", () => {
  it("scopes everything under one root with the mode and the font, and writes no slot for the neutral theme", () => {
    const { container } = render(<MainWamTheme><p>Isi</p></MainWamTheme>);
    const root = container.querySelector("[data-main-wam]") as HTMLElement;
    expect(root.getAttribute("data-mw-mode")).toBe("light");
    expect(root.className).toContain("font-jakarta");
    expect(root.getAttribute("style") ?? "").not.toContain("--mw-kv");
    expect(root.textContent).toContain("Isi");
  });

  it("writes the admin's readable colours and images as slots, and drops the rest with a note", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { container } = render(<MainWamTheme mode="dark" theme={{ accent: "#7A1F2B", primary: "#nope", images: { splash: "/api/wam/acara/tema/splash?v=2", pattern: "javascript:x" } }}><p>Isi</p></MainWamTheme>);
    const root = container.querySelector("[data-main-wam]") as HTMLElement;
    expect(root.getAttribute("data-mw-mode")).toBe("dark");
    expect(root.style.getPropertyValue("--mw-kv-accent")).toBe("#7A1F2B");
    expect(root.style.getPropertyValue("--mw-kv-primary")).toBe("");
    expect(root.style.getPropertyValue("--mw-image-splash")).toContain("/api/wam/acara/tema/splash?v=2");
    expect(root.style.getPropertyValue("--mw-image-pattern")).toBe("");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
