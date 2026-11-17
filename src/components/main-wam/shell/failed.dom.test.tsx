import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { mainWamPath, praWamPath } from "@/lib/routes";
import MainWamScreenError from "@/app/wam/acara/(app)/error";
import { MainWamShell } from "./MainWamShell";
import { SignInFirst } from "./SignInFirst";

/*
 * R2/T-S02: a screen that fails unexpectedly stays inside the frame (tabs still there), with
 * "Coba lagi" and the way to Beranda. M6: nobody signed in in mode pra/uji goes to WAM's sign-in,
 * back to the exact address.
 */

const nav = vi.hoisted(() => ({ pathname: "/wam/acara/momen", back: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ back: nav.back, refresh: nav.refresh, push: vi.fn(), replace: nav.replace, prefetch: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("(app)/error.tsx", () => {
  it("is drawn inside the frame: the tabs stay, with Coba lagi and Ke Beranda", () => {
    render(<MainWamShell greeting={{ kicker: "Selamat pagi", name: "Rani" }}><MainWamScreenError error={new Error("x")} reset={vi.fn()} /></MainWamShell>);
    expect(screen.getByRole("heading", { name: "Layar ini belum dapat dibuka" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Navigasi utama" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ke Beranda" }).getAttribute("href")).toBe(mainWamPath.home);
  });

  it("Coba lagi reads the screen again and resets the boundary", () => {
    const reset = vi.fn();
    render(<MainWamScreenError error={new Error("x")} reset={reset} />);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Coba lagi" })); });
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("says nothing technical", () => {
    render(<MainWamScreenError error={new Error("relation mw_x does not exist")} reset={vi.fn()} />);
    expect(document.body.textContent).not.toMatch(/mw_|relation|Error/);
  });
});

describe("SignInFirst", () => {
  it("sends the person to WAM's sign-in, back to the exact address (a QR's)", () => {
    window.history.replaceState(null, "", "/wam/acara/absen/abc123?x=1");
    render(<SignInFirst />);
    expect(nav.replace).toHaveBeenCalledWith(praWamPath.login("/wam/acara/absen/abc123?x=1"));
    expect(document.body.textContent).toBe("");
  });
});
