import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LangProvider } from "@/components/main-wam/i18n";
import { sampleFeedSemua, sampleSessionCounts } from "@/lib/main-wam/momen/sample";
import { sessionChoice } from "@/lib/main-wam/momen/sessions";
import { sampleSessions, sampleViewer } from "@/lib/main-wam/sample";
import { ToastProvider } from "@/components/main-wam/ui";

/* Momen in English: the labels, counts and a sheet follow the language; Indonesian stays the default. */

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), refresh: vi.fn() }), usePathname: () => "/wam/acara/momen" }));
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
  mode: "baru" as const, view: "semua" as const, session: null, sessionTitle: null, items: sampleFeedSemua, next: null, total: 24, startIndex: 2, offset: 0,
  counts: sampleSessionCounts, sessions: sampleSessions.filter(s => s.status === "terbit").map(s => sessionChoice(s, now, "en")), group: sampleViewer("peserta").group,
  groupsPublished: true, mozaik: true, migrated: true, anyPhotos: true, own: null, eventName: "WAM 2026", nowIso: now.toISOString(), demo: {},
};
const view = (lang: "id" | "en", node: React.ReactNode) => render(<LangProvider lang={lang}><ToastProvider>{node}</ToastProvider></LangProvider>);

describe("Momen in English", () => {
  it("the stack's chips, filter and count say it in English", () => {
    view("en", <MomenStack {...props} />);
    expect(screen.getByRole("radiogroup", { name: "Filter Moments" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "My group" })).toBeTruthy();
    expect(screen.getByText("3 of 24 new")).toBeTruthy();
    expect(screen.getByLabelText("Open the camera")).toBeTruthy();
  });

  it("the same screen in Indonesian is what it was", () => {
    view("id", <MomenStack {...props} />);
    expect(screen.getByRole("radiogroup", { name: "Saring Momen" })).toBeTruthy();
    expect(screen.getByText("3 dari 24 baru")).toBeTruthy();
  });

  it("the report sheet: title, reasons and the validation message", async () => {
    view("en", <ReportSheet open onClose={() => undefined} onSubmit={async () => undefined} />);
    expect(screen.getByRole("heading", { name: "Report photo" })).toBeTruthy();
    expect(screen.getByText("I am in this photo and do not agree")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByText("Choose one reason.")).toBeTruthy();
  });
});
