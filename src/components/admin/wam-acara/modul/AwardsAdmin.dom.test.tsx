import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { sampleApprovals, sampleCounts, at } from "@/lib/main-wam/modul/sample";
import { closedTally } from "@/lib/main-wam/modul/awards";
import { sampleAwards, sampleGroups, samplePeople, sampleSessions } from "@/lib/main-wam/sample";
import { mainWamAdminApi } from "@/lib/routes";
import type { AdminAwards } from "@/lib/server/main-wam/modul/admin";

const request = vi.fn();
vi.mock("@/components/admin/shared/api", async importOriginal => ({ ...(await importOriginal<object>()), adminRequest: (...args: unknown[]) => request(...args) }));
const { AwardsAdmin } = await import("./AwardsAdmin");

afterEach(() => { cleanup(); request.mockReset(); vi.restoreAllMocks(); });

function awards(open: boolean, approved: boolean): AdminAwards {
  const counts = sampleCounts();
  const now = at("2027-01-06", open ? "10:00" : "16:00");
  return {
    migrated: true, categories: sampleAwards, approvals: approved ? Object.values(sampleApprovals(true)).map(item => ({ ...item, approvedBy: null })) : [],
    tallies: sampleAwards.flatMap(category => { const tally = closedTally(category, new Map(Object.entries(counts[category.id] ?? {})), now); return tally ? [{ categoryId: category.id, ...tally }] : []; }),
    sessions: sampleSessions.map(({ id, title, startsAt, status }) => ({ id, title, startsAt, status })),
    people: Object.values(samplePeople).map(person => ({ id: person.id, fullName: person.fullName, department: person.department })),
    groups: sampleGroups.map(group => `Kelompok ${group.number}`), departments: ["CoE"], photos: [], approverNames: {},
  };
}
const draw = (open: boolean, approved = false) => render(<AwardsAdmin initial={awards(open, approved)} now={at("2027-01-06", open ? "10:00" : "16:00").toISOString()} />);
const label = "Setujui sebagai pemenang";

it("shows the approve button only where the rules allow: jury any time, voting once closed", () => {
  draw(true);
  expect(within(screen.getByRole("region", { name: "Rekan paling suportif" })).queryAllByRole("button", { name: label })).toHaveLength(0);
  expect(within(screen.getByRole("region", { name: "Departemen paling berdampak" })).queryAllByRole("button", { name: label }).length).toBeGreaterThan(0);
  cleanup();
  draw(false);
  expect(within(screen.getByRole("region", { name: "Rekan paling suportif" })).queryAllByRole("button", { name: label }).length).toBeGreaterThan(0);
});

it("asks to confirm (naming the nominee, panitia told), then posts the nominee and reloads", async () => {
  request.mockResolvedValue({ message: "Pemenang disetujui. Panitia diberi kabar.", data: awards(false, false) });
  const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
  draw(false);
  const card = screen.getByRole("region", { name: "Rekan paling suportif" });
  fireEvent.click(within(card).getAllByRole("button", { name: label })[0]);
  expect(request).not.toHaveBeenCalled();
  expect(confirm.mock.calls[0][0]).toMatch(/Panitia diberi kabar/);
  fireEvent.click(within(card).getAllByRole("button", { name: label })[0]);
  await waitFor(() => expect(request).toHaveBeenCalled());
  expect(request.mock.calls[0][0]).toBe(mainWamAdminApi.awardApprove(sampleAwards[0].id));
  expect(JSON.parse((request.mock.calls[0][1] as { body: string }).body)).toEqual({ nomineeId: sampleAwards[0].nominees[0].id });
  expect(await screen.findByText("Pemenang disetujui. Panitia diberi kabar.")).toBeTruthy();
});

it("marks an admin-approved winner as Disetujui (no button on it) and lets another nominee replace it", () => {
  draw(false, true);
  const card = screen.getByRole("region", { name: "Rekan paling suportif" });
  expect(within(card).getByText("Disetujui")).toBeTruthy();
  expect(within(card).getByText(/Pemenang · disetujui Admin/)).toBeTruthy();
  expect(within(card).getAllByRole("button", { name: label })).toHaveLength(sampleAwards[0].nominees.length - 1);
});
