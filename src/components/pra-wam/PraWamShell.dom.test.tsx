import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { PraWamRole } from "@/lib/pra-wam/roles";

vi.mock("@/lib/server/pra-wam/announcements", () => ({ unreadCount: async () => 2 }));
vi.mock("@/lib/server/pra-wam/requests", () => ({ openRequestCount: async () => 3 }));
vi.mock("@/lib/server/pra-wam/events", () => ({ currentPhase: async () => ({ kind: "pra_wam", name: "Pra WAM", startDate: "2026-10-28", endDate: "2026-12-23", daysToWam: 60 }) }));
// The frame reads the screen from the address: each test sets where it is.
const at = vi.hoisted(() => ({ path: "/wam", search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => at.path,
  useSearchParams: () => new URLSearchParams(at.search),
}));
vi.mock("@/lib/server/pra-wam/quick-actions", () => ({ quickActionData: async () => ({ checkIn: null, upcoming: null, bookingOpen: true, running: [] }) }));
// HOD: Admin WAM ticked "hod" (the unit import's leads are HOD too, on the server).
vi.mock("@/lib/server/pra-wam/hod", () => ({
  hodStanding: async (who: { roles: string[] }) => ({ isHod: who.roles.includes("hod"), unitIds: [] }),
  hodWaitingCount: async () => 1,
}));

import { PraWamShell, manageGroups } from "./PraWamShell";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);

const member = (roles: PraWamRole[]) => ({ id: "m1", name: "Dewi Lestari", nickname: "Dewi", department: "HC", roles, photo: null });

describe("Kelola acara's sidebar", () => {
  it("groups the panitia's places, with the waiting requests on Permintaan jadwal", () => {
    const groups = manageGroups({ roles: ["panitia"] }, 3);
    expect(groups.map(group => [group.label, group.items.map(item => item.label)])).toEqual([
      ["Ikhtisar", ["Ringkasan"]],
      ["Jadwal", ["Sesi", "Permintaan jadwal"]],
      ["Orang", ["Peserta", "Kebutuhan peserta"]],
      ["Komunikasi", ["Pengumuman", "Survei"]],
    ]);
    expect(groups[1].items[1]).toMatchObject({ href: "/wam/manage/requests", badge: "3" });
    expect(manageGroups({ roles: ["panitia"] }, 0)[1].items[1].badge).toBeUndefined();
  });

  it("shows a BOD only what a BOD may open", () => {
    expect(manageGroups({ roles: ["bod"] }).map(group => [group.label, group.items.map(item => item.label)])).toEqual([
      ["Ikhtisar", ["Ringkasan"]], ["Jadwal", ["Sesi"]], ["Orang", ["Peserta"]], ["Komunikasi", ["Survei"]],
    ]);
    expect(manageGroups({ roles: [] })).toEqual([]);
  });
});

describe("PraWamShell", () => {
  it("puts the panitia in the console: sidebar, back to the app, Keluar, and the phone's own bars", async () => {
    at.path = "/wam/manage/requests";
    render(await PraWamShell({ member: member(["panitia"]), children: <p>Isi halaman</p> }));
    // The sidebar comes first; the phone's bottom bar has the same name (only one shows at a width).
    const [menu, bottom] = screen.getAllByRole("navigation", { name: "Menu Kelola acara" });
    expect(within(menu).getByRole("link", { name: /Permintaan jadwal/ }).getAttribute("aria-current")).toBe("page");
    expect(within(menu).getByText("permintaan menunggu")).toBeTruthy();
    expect(screen.getByText("Dewi · Peserta · Panitia")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Kembali ke aplikasi" }).getAttribute("href")).toBe("/wam");
    expect(screen.getByRole("button", { name: "Keluar" })).toBeTruthy();
    // The phone keeps the app's bar with "Keluar" and the panitia's bottom bar.
    expect(screen.getByRole("link", { name: "Keluar dari Kelola acara" }).getAttribute("href")).toBe("/wam");
    expect(within(bottom).getByRole("link", { name: /Permintaan/ }).textContent).toContain("3 menunggu");
    expect(screen.getByRole("main").textContent).toContain("Isi halaman");
  });

  it("keeps a BOD in the app's own frame with the BOD menu, and no + (a BOD does not check in)", async () => {
    at.path = "/wam/manage/people";
    render(await PraWamShell({ member: member(["bod"]), children: <p>Isi</p> }));
    expect(screen.queryByText("Kembali ke aplikasi")).toBeNull();
    expect(screen.getAllByRole("navigation", { name: "Menu WAM" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Keluar dari Kelola acara" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Aksi cepat" })).toBeNull();
  });

  it("gives everyone else Beranda, Book, the blue +, Dokumen and Profil; Agenda is on Beranda now", async () => {
    at.path = "/wam";
    render(await PraWamShell({ member: member([]), children: <p>Isi</p> }));
    const bottom = screen.getAllByRole("navigation", { name: "Menu WAM" }).at(-1)!;
    // The + carries its sheet (a <dialog>, shown in the top layer) right after it.
    const parts = [...bottom.children].filter(child => child.tagName !== "DIALOG").map(child => child.getAttribute("aria-label") ?? child.textContent);
    expect(parts).toEqual(["Beranda", "Book", "Aksi cepat", "Dokumen", "Profil"]);
    expect(within(bottom).queryByRole("link", { name: "Agenda" })).toBeNull();
    // The desktop top bar has the same + as a labelled button.
    expect(screen.getAllByRole("button", { name: "Aksi cepat" })).toHaveLength(2);
  });

  it("adds Meeting HOD after Book for a HOD, with the invitations waiting", async () => {
    at.path = "/wam/hod";
    render(await PraWamShell({ member: member(["hod"]), children: <p>Isi</p> }));
    const bottom = screen.getAllByRole("navigation", { name: "Menu WAM" }).at(-1)!;
    const parts = [...bottom.children].filter(child => child.tagName !== "DIALOG").map(child => child.getAttribute("aria-label") ?? child.firstElementChild?.nextElementSibling?.textContent);
    expect(parts).toEqual(["Beranda", "Book", "Aksi cepat", "HOD", "Dokumen", "Profil"]);
    const hod = within(bottom).getByRole("link", { name: /HOD/ });
    expect(hod.getAttribute("aria-current")).toBe("page");
    expect(hod.textContent).toContain("1 menunggu");
  });

  it("gives a detail screen its back bar and no bottom bar", async () => {
    at.path = "/wam/manage/sessions/0b7c2d1e-0000-4000-8000-000000000001";
    render(await PraWamShell({ member: member(["panitia"]), children: <p>Form</p> }));
    expect(screen.getAllByText("Ubah sesi").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Kembali" }).getAttribute("href")).toBe("/wam/manage/sessions");
    expect(screen.getAllByRole("navigation", { name: "Menu Kelola acara" })).toHaveLength(1);
  });
});
