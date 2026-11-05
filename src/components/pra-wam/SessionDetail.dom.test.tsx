// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionView } from "@/lib/pra-wam/agenda";
import type { Session } from "@/lib/pra-wam/sessions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/wam/sessions/s1" }));
const { SessionDetail } = await import("./SessionDetail");

afterEach(cleanup);

const session = (status: Session["status"]): Session => ({
  id: "s1", title: "Makan", kind: "rapat", description: "", status, planFrom: null, planTo: null,
  startsAt: "2026-11-05T05:30:00Z", endsAt: "2026-11-05T06:30:00Z", roomId: null, roomName: null, location: "",
  participantCount: 2, isParticipant: true, participants: null, booking: null,
});
const view = (status: Session["status"]): Extract<SessionView, { kind: "sesi" }> => ({
  kind: "sesi", session: session(status), documents: [], storage: true, attendance: { ready: true, checkedInAt: null },
  requests: [], rooms: [], viewer: { name: "Mido", manage: true, staff: true },
});
const NOW = new Date("2026-11-05T11:00:00Z");

describe("SessionDetail: materials", () => {
  it("lets panitia add materials to a published or draft session", () => {
    render(<SessionDetail view={view("terbit")} now={NOW} />);
    expect(screen.getAllByRole("button", { name: /Unggah materi/ }).length).toBeGreaterThan(0);
  });

  it("offers no upload on a cancelled session, not even to panitia (audit 5 Nov 2026)", () => {
    render(<SessionDetail view={view("batal")} now={NOW} />);
    expect(screen.queryByRole("button", { name: /Unggah materi/ })).toBeNull();
    expect(screen.getByText("Sesi ini dibatalkan.")).toBeTruthy();
  });
});
