import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Loading } from "./Loading";

afterEach(cleanup);

describe("the loading state", () => {
  it("announces what is being loaded, not just that something is", () => {
    render(<Loading label="Memuat konfirmasi kehadiran" />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Memuat konfirmasi kehadiran");
    expect(status.getAttribute("aria-live")).toBe("polite");
  });

  it("hides the spinner from screen readers, since the text already says it", () => {
    render(<Loading />);
    expect(screen.getByRole("status").querySelector("span")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("falls back to a sensible label", () => {
    render(<Loading />);
    expect(screen.getByRole("status").textContent).toContain("Memuat");
  });
});
