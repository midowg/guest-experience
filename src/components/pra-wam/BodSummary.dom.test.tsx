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
    render(<BodSummary data={summary} insights={insights} greeting="Selamat pagi, Fadli" date="Kamis, 26 November" />);
    expect(screen.getByRole("heading", { level: 1, name: "Selamat pagi, Fadli" })).toBeTruthy();
    expect(screen.getByText("Belum ada forum yang berjalan")).toBeTruthy();
    expect(screen.getAllByText("Jadwal ruang belum bisa dibaca.").length).toBe(2);
    expect(screen.getByText("Tidak ada yang perlu perhatian saat ini.")).toBeTruthy();
  });

  it("opens MCP from Profil for a granted account, and points others to Admin WAM", () => {
    const { rerender } = render(<BodSummary data={summary} insights={insights} greeting="Hai" date="Hari ini" mcp={{ granted: true, hasKey: true }} />);
    expect(screen.getByRole("link", { name: /Tanya data \(MCP\)/ }).getAttribute("href")).toBe("/wam/settings#mcp");
    rerender(<BodSummary data={summary} insights={insights} greeting="Hai" date="Hari ini" mcp={null} />);
    expect(screen.queryByRole("link", { name: /Tanya data/ })).toBeNull();
    expect(screen.getByText("Minta akses ke Admin WAM")).toBeTruthy();
  });
});
