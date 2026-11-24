// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { BodInsights } from "@/lib/server/pra-wam/bod-insights";
import type { BodSummary as Summary } from "@/lib/server/pra-wam/dashboard";
import { BodSummary } from "./BodSummary";

afterEach(cleanup);

const summary: Summary = {
  migrated: true, attendanceReady: true, people: 10, departments: 2, businessUnits: 0, active: null,
  accounts: 10, signedIn: 7, published: 3, drafts: 1, openRequests: 0, forums: [], units: [], attention: [],
};
const insights: BodInsights = {
  today: "2026-11-26", phase: null, sessions: [], upcoming: [], rooms: null, checkIns: null, adoption: [], signedInWeek: 4,
  documents: null, announcements: null, requests: null, hod: null, businessUnits: [],
};

describe("BodSummary", () => {
  it("says what is missing instead of inventing numbers", () => {
    const { unmount } = render(<BodSummary data={summary} insights={insights} greeting="Selamat pagi, Fadli" date="Kamis, 26 November" />);
    expect(screen.getByRole("heading", { level: 1, name: "Selamat pagi, Fadli" })).toBeTruthy();
    expect(screen.getByText("Belum ada forum yang berjalan")).toBeTruthy();
    expect(screen.getByText("Tidak ada yang perlu perhatian saat ini.")).toBeTruthy();
    unmount();
    render(<BodSummary view="analitik" data={summary} insights={insights} greeting="Selamat pagi, Fadli" date="Kamis, 26 November" />);
    expect(screen.getAllByText("Jadwal ruang belum bisa dibaca.").length).toBe(2);
  });

  it("keeps Ringkasan simple: what matters, the questionnaire under Jejak karbon, the figures and charts only in Analitik (24 Nov 2026)", () => {
    const survey = { name: "Kuesioner personal WAM 2026", participation: { done: 38, active: 57 } };
    const { container, unmount } = render(<BodSummary data={summary} insights={insights} greeting="Selamat pagi, Fadli" date="Kamis, 26 November" carbon={<p>Kartu karbon</p>} survey={survey} />);
    expect(screen.getByText("Perlu perhatian")).toBeTruthy();
    const carbon = screen.getByText("Kartu karbon");
    const card = screen.getByRole("region", { name: "Kuesioner personal WAM 2026" });
    // The card comes right after Jejak karbon, in the same column.
    expect(carbon.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: /Lihat semua jawaban/ }).getAttribute("href")).toBe("/wam/analitik/kuesioner");
    expect(screen.getByRole("link", { name: /Export/ }).getAttribute("href")).toBe("/wam/analitik/kuesioner?export=1");
    // The four figures are Analitik's: not repeated on Ringkasan, and no second way to Analitik beside the menu.
    expect(container.querySelector('[aria-label="Angka utama"]')).toBeNull();
    expect(screen.queryByRole("link", { name: /Lihat semua data/ })).toBeNull();
    expect(screen.queryByText("Kehadiran per forum")).toBeNull();
    expect(screen.queryByText("Pemakaian ruang")).toBeNull();
    unmount();
    render(<BodSummary view="analitik" data={summary} insights={insights} greeting="Hai" date="Hari ini" />);
    expect(screen.getByRole("heading", { name: "Analitik" })).toBeTruthy();
    expect(screen.getByText("Kehadiran per forum")).toBeTruthy();
    expect(screen.queryByText("Perlu perhatian")).toBeNull();
  });

  it("has no MCP link: Akses MCP is not in the peserta app", () => {
    render(<BodSummary data={summary} insights={insights} greeting="Hai" date="Hari ini" />);
    expect(screen.queryByText(/Tanya data/)).toBeNull();
  });
});
