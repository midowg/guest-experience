import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { LangProvider } from "@/components/main-wam/i18n";
import { ToastProvider } from "@/components/main-wam/ui";
import type { Lang } from "@/lib/main-wam/i18n";
import { soalTimes } from "@/lib/main-wam/kuis/flow";
import { SAMPLE_ME, SAMPLE_PLAYERS, SAMPLE_QUESTIONS, SAMPLE_T0, sampleAlias, sampleAnswers, sampleRun, sampleTallies } from "@/lib/main-wam/kuis/sample";
import { buildControl, buildPlay } from "@/lib/main-wam/kuis/snapshot";
import { ControlScreen } from "./ControlScreen";
import { PlayScreen } from "./PlayScreen";

/*
 * Kuis live's phone and the MC's control, drawn from the server's snapshot at one moment: no right or wrong
 * before the answer opens, the lock, the result once open, English, and the MC's Lanjut naming its step.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/wam/acara/kuis/x" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

const QUIZ = { id: "00000000-0000-4000-a000-0000000000aa", title: "Kuis WAM" };
const index = 2;
const times = soalTimes(SAMPLE_QUESTIONS[index].level);
const run = sampleRun({ phase: "soal", index, phaseAt: SAMPLE_T0, rev: 4 });
const correct = SAMPLE_QUESTIONS[index].correct;
const mine = (withAnswer: boolean) => ({
  alias: sampleAlias(0), joinedAt: SAMPLE_T0,
  answers: [0, 1, ...(withAnswer ? [index] : [])].flatMap(i => sampleAnswers(i).filter(answer => answer.employeeId === SAMPLE_ME)),
});
function phone(now: number, withAnswer: boolean, lang: Lang = "id") {
  const open = now >= SAMPLE_T0 + times.reveal;
  const snap = buildPlay({ quiz: QUIZ, run, now, players: SAMPLE_PLAYERS, mine: mine(withAnswer), employeeId: SAMPLE_ME, tallies: open ? sampleTallies(index, index - 1) : null, answers: open ? sampleAnswers(index) : null });
  return render(<LangProvider lang={lang}><ToastProvider><PlayScreen quizId={QUIZ.id} initial={snap} preview={{ now }} /></ToastProvider></LangProvider>);
}

describe("a player's phone", () => {
  it("while the question runs: the value falls, four options to tap, nothing says right or wrong", () => {
    phone(SAMPLE_T0 + times.open + 6_000, false);
    expect(screen.getByText("Nilai saat ini")).toBeTruthy();
    expect(screen.getByText("440")).toBeTruthy();
    const options = screen.getAllByRole("button", { pressed: false });
    expect(options.filter(button => !(button as HTMLButtonElement).disabled)).toHaveLength(4);
    expect(screen.queryByText("Benar")).toBeNull();
    expect(screen.queryByLabelText("Benar")).toBeNull();
  });

  it("locked: the value it will get if right, the other options closed, still no right or wrong", () => {
    phone(SAMPLE_T0 + times.open + 9_000, true);
    expect(screen.getByText(/Terkunci · 458/)).toBeTruthy();
    expect(screen.getByRole("button", { pressed: true }).textContent).toContain(SAMPLE_QUESTIONS[index].options[correct]);
    for (const button of screen.getAllByRole("button", { pressed: false })) expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("Benar")).toBeNull();
  });

  it("once the answer has lit (with \"kurangi gerak\": no count-up): right, the points, the spread in percent, my pick marked", () => {
    const motion = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
    try {
      phone(SAMPLE_T0 + times.light + 1_000, true);
      expect(screen.getAllByText("Benar").length).toBeGreaterThan(0);
      expect(screen.getByText("+458")).toBeTruthy();
      expect(screen.getByText("Pilihanmu")).toBeTruthy();
      expect(screen.getAllByText(/%$/)).toHaveLength(4);
    } finally { window.matchMedia = motion; }
  });

  it("in English", () => {
    phone(SAMPLE_T0 + times.open + 6_000, false, "en");
    expect(screen.getByText("Points now")).toBeTruthy();
    expect(screen.getByText("Question 3 of 8")).toBeTruthy();
    expect(screen.queryByText("Nilai saat ini")).toBeNull();
  });
});

describe("the MC's control", () => {
  it("names the next step on Lanjut, and waits while the question runs", () => {
    const control = (now: number) => render(<ToastProvider><ControlScreen quizId={QUIZ.id} initial={buildControl({ quiz: QUIZ, run, now, players: 12, answered: 5, answers: now >= SAMPLE_T0 + times.reveal ? sampleAnswers(index) : null })} preview={{ now }} /></ToastProvider>);
    control(SAMPLE_T0 + times.open + 2_000);
    const waiting = screen.getByRole("button", { name: /Soal berjalan sampai waktu habis/ }) as HTMLButtonElement;
    expect(waiting.disabled).toBe(true);
    expect(screen.queryByText(/Jawaban benar/)).toBeNull();
    cleanup();
    control(SAMPLE_T0 + times.light + 500);
    const next = screen.getByRole("button", { name: /Lanjut: Bersiap soal 4/ }) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Batalkan soal/ }));
    expect(screen.getByText("Batalkan soal 3?")).toBeTruthy();
  });
});
