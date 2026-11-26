import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { LangProvider } from "@/components/main-wam/i18n";
import { ToastProvider } from "@/components/main-wam/ui";
import type { Lang } from "@/lib/main-wam/i18n";
import { at, sampleNominees, sampleSilentView } from "@/lib/main-wam/modul/sample";
import { sampleAwards } from "@/lib/main-wam/sample";
import { NomineePicker } from "./awards/NomineePicker";
import { CheckInResultView } from "./absen/CheckIn";
import { AbsenView } from "./SessionViews";
import { SilentForm } from "./silent/SilentForm";

/* The module screens in English (Pengaturan → Bahasa): the same screens, the same data, the words and clocks in English. */

const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/wam2026" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  window.scrollTo = () => undefined;
});
afterEach(() => { cleanup(); window.localStorage.clear(); });

const within = (lang: Lang, node: ReactNode) => render(<LangProvider lang={lang}><ToastProvider>{node}</ToastProvider></LangProvider>);

describe("Silent Meeting form", () => {
  const view = sampleSilentView("buka");
  it("English: the labels, the privacy note and the send button; the question stays as the committee wrote it", () => {
    within("en", <SilentForm view={view} remaining={10} preview={{}} />);
    expect(screen.getByText("Anonymous")).toBeTruthy();
    expect(screen.getByText("Your name is not saved with this feedback.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
    expect(screen.getByText(view.question.question)).toBeTruthy();
    expect(screen.queryByText("Masukanmu")).toBeNull();
  });

  it("Indonesian stays as it was", () => {
    within("id", <SilentForm view={view} remaining={10} preview={{}} />);
    expect(screen.getByText("Namamu tidak disimpan bersama masukan ini.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kirim" })).toBeTruthy();
  });
});

describe("Check in", () => {
  const now = at("2027-01-05", "07:52");
  const session = { id: "s1", title: "Pemaparan departemen", place: "Aula Utama" };
  it("the result says it in English with a 24-hour clock", () => {
    within("en", <CheckInResultView contact={null} now={now} outcome={{ kind: "tercatat", session, checkedInAt: now.toISOString() }} />);
    expect(screen.getByText("Checked in")).toBeTruthy();
    expect(screen.getByText("Pemaparan departemen · 07:52")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Done" })).toBeTruthy();
  });

  it("the card on Detail sesi: the button and the present pill", () => {
    within("en", <AbsenView slot={{ kind: "hadir", at: now.toISOString() }} />);
    expect(screen.getByText("Present 07:52")).toBeTruthy();
    cleanup();
    within("id", <AbsenView slot={{ kind: "hadir", at: now.toISOString() }} />);
    expect(screen.getByText("Hadir 07.52")).toBeTruthy();
  });

  it("the tablet line (QR check-in hidden) in both languages", () => {
    within("en", <AbsenView slot={{ kind: "tablet" }} />);
    expect(screen.getByText("Check in by face scan on the tablet at the room door")).toBeTruthy();
    cleanup();
    within("id", <AbsenView slot={{ kind: "tablet" }} />);
    expect(screen.getByText("Absen lewat scan wajah di tablet pintu ruang")).toBeTruthy();
  });
});

describe("Awarding nominee picker", () => {
  it("English: the secrecy line, the legend and the button", () => {
    const category = sampleAwards[0];
    within("en", <NomineePicker now={at("2027-01-06", "10:01")} current={null}
      nominees={category.nominees.map(nominee => sampleNominees()[nominee.id])}
      category={{ id: category.id, title: category.title, description: "", closesAt: category.closesAt! }} />);
    expect(screen.getByText(/^Secret\. You can change it until /)).toBeTruthy();
    expect(screen.getByText("Choose one first.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
  });
});
