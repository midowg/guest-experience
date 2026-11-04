import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { QQuestion, QSection } from "@/lib/pra-wam/questionnaire";
import { praWamApi } from "@/lib/routes";
import { Questionnaire, type QuestionnaireProps } from "./Questionnaire";
import { anonymousDraftKey } from "./local";

// next/font only runs inside Next's compiler.
vi.mock("./font", () => ({ display: { variable: "" }, body: { variable: "" } }));

const section = (id: string, title: string, anonymous = false, sort = 1): QSection => ({ id, key: id, title, short: title, hello: `Halo ${title}`, intro: "", tease: "", anonymous, sort, hidden: false });
const question = (key: string, sectionId: string, rest: Partial<QQuestion>): QQuestion => ({
  id: `q-${key}`, sectionId, key, prompt: `Pertanyaan ${key}`, kind: "text", required: false, visibility: "rekan", options: [], maxChoices: null, matrixRows: [], scale: [],
  placeholder: "", note: "", react: "", showIf: null, sort: 0, hidden: false, ...rest,
});

const sections = [section("s0", "Kenalan"), section("sD", "Anonim", true, 2)];
const questions = [
  question("1", "s0", { prompt: "Siapa namamu?", required: true, sort: 1 }),
  question("3", "s0", { prompt: "Posisimu?", kind: "single", required: true, visibility: "hr", options: ["Staf", "Lead"], react: "{jawaban}, tercatat.", sort: 2 }),
  question("31", "s0", { prompt: "Ide untuk timmu?", kind: "long", visibility: "pilih", showIf: { question: "3", not: ["Staf"] }, sort: 3 }),
  question("D4", "sD", { prompt: "Pendapatmu didengar?", kind: "single", required: true, visibility: "anon", options: ["Jarang", "Sering"], sort: 4 }),
  question("D5", "sD", { prompt: "Satu kebiasaan kecil?", kind: "long", visibility: "anon", sort: 5 }),
];
const form = { id: "f1", name: "Kuesioner", intro: "Kenalan lebih dekat.", minutes: 15, editUntil: null };
const props = (initial: QuestionnaireProps["initial"] = { answers: {}, anonymousSent: false }): QuestionnaireProps => ({
  form, sections, questions, departments: [], people: [], initial, nickname: "Dewi", home: "/wam",
});

type Call = { url: string; method: string; body: unknown };
let calls: Call[];
beforeEach(() => {
  calls = [];
  window.localStorage.clear();
  window.scrollTo = vi.fn() as typeof window.scrollTo;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
    const data = url === praWamApi.questionnaireAnswer
      ? { value: null, progress: { sectionsDone: 0, sectionsTotal: 2, requiredLeft: 1, done: false }, completedAt: null }
      : { progress: { sectionsDone: 2, sectionsTotal: 2, requiredLeft: 0, done: true }, completedAt: "2026-11-04T10:00:00.000Z" };
    return { ok: true, status: 200, json: async () => ({ ok: true, data, message: "" }) } as Response;
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const heading = () => screen.getByRole("heading", { level: 1 }).textContent ?? screen.getByRole("heading").textContent;
const card = () => screen.getAllByRole("heading").map(item => item.textContent).join(" | ");
const primary = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const answerSaves = () => calls.filter(call => call.url === praWamApi.questionnaireAnswer);

describe("the questionnaire", () => {
  it("holds a required card with a nudge until it is answered, and saves the answer", async () => {
    render(<Questionnaire {...props()} />);
    expect(heading()).toContain("Hai, Dewi!");
    primary("Mulai");
    expect(heading()).toBe("Halo Kenalan");
    primary("Buka kartu");
    expect(card()).toContain("Siapa namamu?");
    const next = screen.getByRole("button", { name: "Lanjut" });
    expect(next.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(next);
    expect(screen.getByText("Yang ini kami butuhkan. Singkat juga tidak apa-apa.")).toBeTruthy();
    expect(card()).toContain("Siapa namamu?");

    fireEvent.change(screen.getByRole("textbox", { name: "Siapa namamu?" }), { target: { value: "Dewi Lestari" } });
    expect(screen.getByRole("button", { name: "Lanjut" }).getAttribute("aria-disabled")).toBeNull();
    expect(screen.queryByText(/Yang ini kami butuhkan/)).toBeNull();
    primary("Lanjut");
    expect(card()).toContain("Posisimu?");
    // Leaving the card sends the typed answer at once, without waiting for the pause.
    await waitFor(() => expect(answerSaves()[0]?.body).toEqual({ question: "1", value: "Dewi Lestari" }));
    expect(screen.getByText("Hanya HR dan manajemen")).toBeTruthy();
  });

  it("branches on an answer: the leads' question shows only when the position is not Staf", async () => {
    render(<Questionnaire {...props({ answers: { 1: "Dewi" }, anonymousSent: false })} />);
    primary("Lanjutkan");
    expect(card()).toContain("Posisimu?");
    primary("Staf");
    expect(screen.getByText("Staf, tercatat.")).toBeTruthy();
    await waitFor(() => expect(answerSaves().at(-1)?.body).toEqual({ question: "3", value: "Staf" }));
    // Staf: this is the section's last card.
    primary("Selesaikan bagian");
    expect(heading()).toBe("Halo Anonim");

    primary("Kembali");
    expect(card()).toContain("Posisimu?");
    primary("Lead");
    primary("Lanjut");
    expect(card()).toContain("Ide untuk timmu?");
    expect(screen.getByRole("button", { name: "Lewati" })).toBeTruthy();
  });

  it("keeps the anonymous section on this device, then sends it once without saving it by name", async () => {
    render(<Questionnaire {...props({ answers: { 1: "Dewi", 3: "Staf" }, anonymousSent: false })} />);
    primary("Lanjutkan");
    expect(card()).toContain("Pendapatmu didengar?");
    expect(screen.getAllByText("Anonim").length).toBeGreaterThan(0);
    primary("Sering");
    expect(JSON.parse(window.localStorage.getItem(anonymousDraftKey("f1"))!)).toEqual({ D4: "Sering" });
    primary("Lanjut");
    fireEvent.change(screen.getByRole("textbox", { name: "Satu kebiasaan kecil?" }), { target: { value: "Bawa tumbler" } });
    expect(JSON.parse(window.localStorage.getItem(anonymousDraftKey("f1"))!)).toEqual({ D4: "Sering", D5: "Bawa tumbler" });
    expect(screen.queryByRole("button", { name: "Lewati" })).toBeNull();
    await new Promise(resolve => setTimeout(resolve, 900));
    expect(answerSaves()).toEqual([]);

    primary(/Kirim bagian anonim/);
    await waitFor(() => expect(heading()).toBe("Selesai"));
    const sent = calls.filter(call => call.url === praWamApi.questionnaireAnonymous);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ method: "POST", body: { answers: { D4: "Sering", D5: "Bawa tumbler" } } });
    expect(window.localStorage.getItem(anonymousDraftKey("f1"))).toBeNull();
    expect(screen.getByText("Terima kasih sudah bercerita. Kartu karaktermu sedang disiapkan.")).toBeTruthy();
    expect(answerSaves()).toEqual([]);
    expect(screen.getByRole("list", { name: "Bagian kuesioner" }).querySelectorAll("li")[1].getAttribute("aria-label")).toContain("selesai");

    primary("Kembali");
    expect(screen.getByText("Sudah terkirim tanpa nama")).toBeTruthy();
  });

  it("restores this device's anonymous draft, and resumes at the first unanswered required card", () => {
    window.localStorage.setItem(anonymousDraftKey("f1"), JSON.stringify({ D4: "Jarang" }));
    render(<Questionnaire {...props({ answers: { 1: "Dewi" }, anonymousSent: false })} />);
    primary("Lanjutkan");
    expect(card()).toContain("Posisimu?");
    primary("Staf");
    primary("Selesaikan bagian");
    primary("Masuk");
    expect(screen.getByRole("button", { name: "Jarang" }).getAttribute("aria-pressed")).toBe("true");
  });
});
