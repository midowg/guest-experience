import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
const request = vi.hoisted(() => vi.fn(async (...args: unknown[]) => { void args; return { data: null, message: "" }; }));
vi.mock("./api", () => ({ praWamRequest: request, errorText: () => "Gagal." }));

import { NotificationList } from "./Notifications";

afterEach(cleanup);

describe("Notifikasi", () => {
  it("answers a Meeting HOD invitation on its note, as Saya hadir on a session", async () => {
    render(<NotificationList now="2026-11-06T03:00:00Z" hodAnswers={{ s1: { meetingId: "m1", response: "menunggu", status: "menunggu" }, s2: { meetingId: "m2", response: "terima", status: "terjadwal" } }} items={[
      { id: "n1", kind: "sesi", title: "Undangan Meeting HOD: Rencana 2027", body: "Ruang sudah dibooking.", sessionId: "s1", createdAt: "2026-11-06T02:00:00Z", readAt: null, hod: true },
      { id: "n2", kind: "sesi", title: "Undangan Meeting HOD: Evaluasi", body: "", sessionId: "s2", createdAt: "2026-11-06T01:00:00Z", readAt: "x", hod: true },
    ]} />);
    const first = within(screen.getByText("Undangan Meeting HOD: Rencana 2027").closest("article")!);
    fireEvent.click(first.getByRole("button", { name: "Terima" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/wam/hod/m1", { method: "POST", json: { accept: true, note: "" } }));
    // One already answered says so instead.
    const second = within(screen.getByText("Undangan Meeting HOD: Evaluasi").closest("article")!);
    expect(second.getByText("Kamu menerima undangan ini.")).toBeTruthy();
    expect(second.queryByRole("button", { name: "Terima" })).toBeNull();
  });
});
