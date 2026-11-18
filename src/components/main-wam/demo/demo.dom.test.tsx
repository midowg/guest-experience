import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LangProvider } from "@/components/main-wam/i18n";
import { MainWamShell } from "@/components/main-wam/shell";
import { ToastProvider } from "@/components/main-wam/ui";
import { DemoSwitch } from "./DemoSwitch";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/wam/acara/saya", useRouter: () => ({ back: vi.fn(), refresh: nav.refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

afterEach(() => { cleanup(); nav.refresh.mockReset(); document.cookie = "mw_demo_role=; Max-Age=0; Path=/"; });

describe("Lihat sebagai", () => {
  it("offers Peserta, Panitia and BOD, with the current role chosen and labelled as Mode demo", () => {
    render(<ToastProvider><DemoSwitch role="peserta" /></ToastProvider>);
    expect(screen.getByRole("heading", { name: "Mode demo" })).toBeTruthy();
    const group = screen.getByRole("radiogroup", { name: "Lihat sebagai" });
    expect(Array.from(group.querySelectorAll("[role=radio]")).map(radio => radio.textContent)).toEqual(["Peserta", "Panitia", "BOD"]);
    expect(screen.getByRole("radio", { name: "Peserta" }).getAttribute("aria-checked")).toBe("true");
  });

  it("keeps the pick on this device (cookie) and draws the screens again for it", () => {
    render(<ToastProvider><DemoSwitch role="peserta" /></ToastProvider>);
    fireEvent.click(screen.getByRole("radio", { name: "Panitia" }));
    expect(document.cookie).toContain("mw_demo_role=panitia");
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("radio", { name: "Panitia" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Kini dilihat sebagai Panitia")).toBeTruthy();
  });

  it("is in English too", () => {
    render(<LangProvider lang="en"><ToastProvider><DemoSwitch role="bod" /></ToastProvider></LangProvider>);
    expect(screen.getByRole("radiogroup", { name: "View as" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Participant" })).toBeTruthy();
  });
});

describe("the Mode demo strip", () => {
  it("is shown over the frame only while the demo is on", () => {
    const { rerender } = render(<MainWamShell demo><p>isi</p></MainWamShell>);
    expect(screen.getByText("Mode demo · data contoh")).toBeTruthy();
    rerender(<MainWamShell><p>isi</p></MainWamShell>);
    expect(screen.queryByText("Mode demo · data contoh")).toBeNull();
  });

  it("says it in English", () => {
    render(<LangProvider lang="en"><MainWamShell demo><p>isi</p></MainWamShell></LangProvider>);
    expect(screen.getByText("Demo mode · sample data")).toBeTruthy();
  });
});
