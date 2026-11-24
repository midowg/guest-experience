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

  it("keeps Ringkasan simple: what matters and a way to Analitik, the charts only in Analitik (24 Nov 2026)", () => {
    const { unmount } = render(<BodSummary data={summary} insights={insights} greeting="Selamat pagi, Fadli" date="Kamis, 26 November" carbon={<p>Kartu karbon</p>} />);
    expect(screen.getByText("Perlu perhatian")).toBeTruthy();
    expect(screen.getByText("Kartu karbon")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Lihat semua data/ }).getAttribute("href")).toBe("/wam/analitik");
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
