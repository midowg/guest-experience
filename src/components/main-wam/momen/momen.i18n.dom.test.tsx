import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { LangProvider } from "@/components/main-wam/i18n";
import { sampleFeedSemua, sampleReactors } from "@/lib/main-wam/momen/sample";
import { ToastProvider } from "@/components/main-wam/ui";

/* Momen in English: the labels, counts and a sheet follow the language; Indonesian stays the default. */

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), refresh: vi.fn() }), usePathname: () => "/wam2026/momen" }));
vi.mock("@/components/pra-wam/api", () => ({ praWamRequest: vi.fn(), errorText: () => "Gagal." }));

const { MomenStack } = await import("./MomenStack");
const { ReportSheet } = await import("./MomenSheets");

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  window.matchMedia = window.matchMedia ?? ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as never;
});
afterEach(() => cleanup());

const now = new Date("2027-01-05T10:05:00+07:00");
const props = {
  mode: "baru" as const, session: null, sessionTitle: null, items: sampleFeedSemua, next: null, total: 24, startIndex: 2, offset: 0,
  mozaik: true, migrated: true, anyPhotos: true, own: null, eventName: "WAM 2026", nowIso: now.toISOString(), demo: {},
};
const view = (lang: "id" | "en", node: React.ReactNode) => render(<LangProvider lang={lang}><ToastProvider>{node}</ToastProvider></LangProvider>);

describe("Momen in English", () => {
  it("the stack, the eight emoji and the pill say it in English", () => {
    view("en", <MomenStack {...props} />);
    expect(screen.getByRole("group", { name: /^Photo 3 of 24 new/ })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Quick reactions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "React 🔥" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "24 reactions. Tap to see who" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Photo options" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pick another reaction" })).toBeNull();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("says one reaction in the singular, and the list of who reacted in English", async () => {
    const items = sampleFeedSemua.map((photo, index) => (index === 2 ? { ...photo, reactions: [{ emoji: "🙏", count: 1, mine: true }] } : photo));
    view("en", <MomenStack {...props} items={items} demo={{ sheet: "daftar", reactors: sampleReactors([{ emoji: "🙏", count: 1, mine: true }]) }} />);
    expect(screen.getByRole("button", { name: "1 reaction. Tap to see who" })).toBeTruthy();
    const sheet = screen.getByRole("dialog", { name: "Reactions · 1" });
    expect(within(sheet).getByRole("group", { name: "Filter reactions" })).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "🙏 1 reaction" })).toBeTruthy();
    const mine = within(sheet).getByRole("button", { name: "Remove your reaction 🙏" });
    expect(mine.textContent).toContain("Rani · You");
    expect(mine.textContent).toContain("Tap to remove");
  });

  it("the same screen in Indonesian is what it was", () => {
    view("id", <MomenStack {...props} />);
    expect(screen.getByRole("group", { name: /^Foto ke-3 dari 24 foto baru/ })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Reaksi cepat" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "24 reaksi. Ketuk untuk melihat siapa saja" })).toBeTruthy();
  });

  it("the report sheet: title, reasons and the validation message", async () => {
    view("en", <ReportSheet open onClose={() => undefined} onSubmit={async () => undefined} />);
    expect(screen.getByRole("heading", { name: "Report photo" })).toBeTruthy();
    expect(screen.getByText("I am in this photo and do not agree")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByText("Choose one reason.")).toBeTruthy();
  });
});
