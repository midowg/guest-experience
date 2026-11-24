import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { mainWamPath } from "@/lib/routes";
import { AgendaScreen } from "./AgendaScreen";
import { SessionSheetPending } from "./SessionSheet";

/* Detail sesi opens at once over the screen that stays: only the sheet is a skeleton; and Agenda has no bell. */

const nav = vi.hoisted(() => ({ pathname: "/wam2026", back: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ back: nav.back, replace: nav.replace, push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
afterEach(() => { cleanup(); nav.pathname = "/wam2026"; vi.useRealTimers(); });

const days = [{ key: "1", number: 1, day: "Sen", date: "4 Jan", prep: false, today: true }] as never;

describe("Agenda", () => {
  it("has no bell: the notification button is Beranda's alone", () => {
    render(<AgendaScreen migrated days={days} day={1} rows={[]} anyPublished since="08.00" />);
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Notifikasi/ })).toBeNull();
  });
});

describe("Detail sesi: only the sheet loads", () => {
  function Screen() {
    const [, set] = useState(0);
    return <div>
      <p>Beranda di belakang</p>
      <a href={mainWamPath.session("s-1")} onClick={event => { event.preventDefault(); set(1); }}>Pemaparan</a>
      <a href={mainWamPath.agenda()} onClick={event => event.preventDefault()}>Agenda</a>
      <SessionSheetPending />
    </div>;
  }

  it("a tap on a session opens the sheet's own skeleton at once, the screen behind untouched, and no skeleton of the screen", () => {
    render(<Screen />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Pemaparan" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Beranda di belakang")).toBeTruthy();
    expect(screen.getAllByRole("status").some(el => /Memuat/.test(el.getAttribute("aria-label") ?? ""))).toBe(true);
    expect(screen.queryByLabelText("Memuat agenda")).toBeNull();
  });

  it("another link, or a modified tap, opens nothing; the sheet of the address takes over when the address changes", () => {
    const view = render(<Screen />);
    fireEvent.click(screen.getByRole("link", { name: "Agenda" }));
    fireEvent.click(screen.getByRole("link", { name: "Pemaparan" }), { ctrlKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Pemaparan" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    nav.pathname = mainWamPath.session("s-1");
    act(() => view.rerender(<Screen />));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("✕ on the opening sheet only drops it (nothing to go back to yet); a navigation that never lands does not leave it up", () => {
    vi.useFakeTimers();
    render(<Screen />);
    fireEvent.click(screen.getByRole("link", { name: "Pemaparan" }));
    fireEvent.click(screen.getByRole("button", { name: /Tutup/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(nav.back).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "Pemaparan" }));
    act(() => { vi.advanceTimersByTime(10_500); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
