import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock("./api", () => ({ praWamRequest: vi.fn(async () => ({ data: null, message: "" })), errorText: () => "Gagal." }));

import { NotificationList } from "./Notifications";

afterEach(cleanup);

describe("Notifikasi", () => {
  it("opens Meeting HOD from its invitation, and a session from a session's note", () => {
    render(<NotificationList now="2026-11-06T03:00:00Z" items={[
      { id: "n1", kind: "sesi", title: "Undangan Meeting HOD: Rencana 2027", body: "Terima atau tolak di Book → Meeting HOD.", sessionId: null, createdAt: "2026-11-06T02:00:00Z", readAt: null, link: { href: "/wam/book?lihat=hod", label: "Buka Meeting HOD" } },
      { id: "n2", kind: "sesi", title: "Sesi dipindah", body: "", sessionId: "s1", createdAt: "2026-11-06T01:00:00Z", readAt: null },
    ]} />);
    expect(screen.getByRole("link", { name: "Buka Meeting HOD" }).getAttribute("href")).toBe("/wam/book?lihat=hod");
    expect(screen.getByRole("link", { name: "Buka sesi" }).getAttribute("href")).toBe("/wam/sessions/s1");
  });
});
