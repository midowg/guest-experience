import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { SentAnnouncement } from "@/lib/server/pra-wam/announcements";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));
const request = vi.fn();
vi.mock("../api", () => ({
  praWamRequest: (...args: unknown[]) => request(...args),
  errorText: (problem: unknown) => (problem instanceof Error ? problem.message : "Terjadi kesalahan."),
}));

import { AnnouncementBoard } from "./AnnouncementBoard";
import { PeopleBoard, type PersonItem } from "./PeopleBoard";
import { RequestCards, type RequestItem } from "./RequestCards";

beforeEach(() => {
  request.mockReset(); refresh.mockReset(); window.localStorage.clear();
  // jsdom has no modal dialogs: opening one only marks it open.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);

describe("PeopleBoard (Peserta)", () => {
  const person = (patch: Partial<PersonItem>): PersonItem => ({
    id: "p1", name: "Ayu Lestari", job: "Staf", unit: "Human Capital", isLead: false, href: "/wam/manage/people/p1", account: "Akun aktif",
    today: { key: "hadir", label: "Hadir", tone: "ok" }, next: "Forum HC · Jum, 6 Nov 13.00", ...patch,
  });
  const people = [
    person({}),
    person({ id: "p2", name: "Budi Santoso", unit: "IT", isLead: true, href: "/wam/manage/people/p2", today: { key: "belum", label: "Belum absen", tone: "warn" }, next: null }),
    person({ id: "p3", name: "Citra Dewi", unit: "Finance", href: "/wam/manage/people/p3", today: { key: "kosong", label: "Tidak ada sesi", tone: "neutral" } }),
  ];

  it("shows everyone as cards with today's status and the next session, each opening the profile", () => {
    render(<PeopleBoard people={people} attendanceReady />);
    const cards = within(screen.getByRole("list", { name: "Peserta" })).getAllByRole("link");
    expect(cards).toHaveLength(3);
    expect(cards[0].getAttribute("href")).toBe("/wam/manage/people/p1");
    expect(within(cards[0]).getByText("Hadir")).toBeTruthy();
    expect(within(cards[0]).getByText("Sesi berikutnya: Forum HC · Jum, 6 Nov 13.00")).toBeTruthy();
    expect(within(cards[1]).getByText("HOD")).toBeTruthy();
    expect(within(cards[1]).getByText("Sesi berikutnya: belum ada")).toBeTruthy();
  });

  it("filters by today and by a search, and switches to a table that is remembered", () => {
    render(<PeopleBoard people={people} attendanceReady />);
    fireEvent.click(screen.getByRole("button", { name: /Hadir hari ini/ }));
    expect(within(screen.getByRole("list", { name: "Peserta" })).getAllByRole("link")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Punya sesi hari ini/ }));
    expect(within(screen.getByRole("list", { name: "Peserta" })).getAllByRole("link")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Semua/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Cari peserta" }), { target: { value: "finance" } });
    expect(screen.getByText("Citra Dewi")).toBeTruthy();
    expect(screen.queryByText("Ayu Lestari")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tabel" }));
    expect(screen.getByRole("table")).toBeTruthy();
    expect(window.localStorage.getItem("console-view:wam-manage-peserta")).toBe("tabel");
  });

  it("leaves out the attendance filter while attendance is not recorded", () => {
    render(<PeopleBoard people={people} attendanceReady={false} />);
    expect(screen.queryByRole("button", { name: /Hadir hari ini/ })).toBeNull();
  });
});

describe("RequestCards (Permintaan jadwal)", () => {
  const item = (patch: Partial<RequestItem>): RequestItem => ({
    id: "q1", sessionId: "s1", sessionTitle: "Forum HC", requester: "Ayu Lestari", requesterId: "p1",
    fromStartsAt: "2026-11-06T02:00:00.000Z", fromEndsAt: "2026-11-06T03:00:00.000Z", toStartsAt: "2026-11-07T02:00:00.000Z", toEndsAt: "2026-11-07T03:00:00.000Z",
    toRoomId: null, toRoomName: null, reason: "Ada kunjungan klien.", status: "diajukan", reviewNote: "", reviewedAt: null, createdAt: "2026-11-05T01:00:00.000Z",
    stillCurrent: true, fromRoom: "Limasan", check: { tone: "ok", text: "Limasan kosong pada jam itu." }, ...patch,
  });

  it("compares now and asked, shows the room check, and approves only after a second yes", async () => {
    request.mockResolvedValue({ data: null, message: "Disetujui." });
    render(<RequestCards requests={[item({})]} emptyText="Kosong" />);
    const card = screen.getByRole("article", { name: "Ayu Lestari" });
    expect(within(card).getByText("Ganti jadwal · Forum HC")).toBeTruthy();
    expect(within(card).getByText("Sekarang")).toBeTruthy();
    expect(within(card).getByText("Diminta")).toBeTruthy();
    expect(within(card).getByText("Limasan kosong pada jam itu.")).toBeTruthy();
    fireEvent.change(within(card).getByRole("textbox", { name: "Catatan untuk Ayu Lestari" }), { target: { value: "Oke" } });
    fireEvent.click(within(card).getByRole("button", { name: "Setujui" }));
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(within(card).getByRole("button", { name: "Ya, setujui" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/wam/requests/q1", { method: "POST", json: { approve: true, note: "Oke" } }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("declines at once, and cannot approve a request whose session has moved", async () => {
    request.mockResolvedValue({ data: null, message: "Ditolak." });
    render(<RequestCards requests={[item({ stillCurrent: false, check: { tone: "warn", text: "Jadwal sesi sudah berubah sejak diajukan. Tolak dengan catatan." } })]} emptyText="Kosong" />);
    expect((screen.getByRole("button", { name: "Setujui" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Tolak" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/wam/requests/q1", { method: "POST", json: { approve: false, note: "" } }));
  });

  it("shows an answered request read only, and the empty text", () => {
    const { unmount } = render(<RequestCards requests={[item({ status: "ditolak", reviewNote: "Ruang penuh", check: undefined })]} emptyText="Kosong" />);
    expect(screen.getByText("Ditolak")).toBeTruthy();
    expect(screen.getByText("Catatan panitia: Ruang penuh")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    unmount();
    render(<RequestCards requests={[]} emptyText="Tidak ada permintaan yang menunggu." />);
    expect(screen.getByText("Tidak ada permintaan yang menunggu.")).toBeTruthy();
  });
});

describe("AnnouncementBoard (Pengumuman)", () => {
  const sent: SentAnnouncement[] = [
    { id: "a1", title: "Dress code", body: "Batik untuk Jumat.", audienceLabel: "Semua peserta", createdAt: "2026-11-05T01:00:00.000Z", recipients: 40, read: 12 },
    { id: "a2", title: "Ruang pindah", body: "", audienceLabel: "Forum HC", createdAt: "2026-11-04T01:00:00.000Z", recipients: 2, read: 2 },
  ];

  it("lists what was sent with its text, recipients and read count", () => {
    render(<AnnouncementBoard sent={sent} sessions={[]} units={[]} lead="Kirim info." />);
    const first = screen.getByRole("article", { name: "Dress code" });
    expect(within(first).getByText("Batik untuk Jumat.")).toBeTruthy();
    expect(within(first).getByText("12 / 40 dibaca")).toBeTruthy();
    expect(within(first).getByText(/Semua peserta · 40 penerima/)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Pengumuman" })).toBeTruthy();
  });

  it("opens the form from Tulis pengumuman and sends only after a confirmation", async () => {
    request.mockResolvedValue({ data: 40, message: "Terkirim ke 40 orang." });
    render(<AnnouncementBoard sent={[]} sessions={[]} units={[]} lead="Kirim info." />);
    expect(screen.queryByRole("textbox", { name: "Judul" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tulis pengumuman" }));
    const send = screen.getByRole("button", { name: "Kirim sekarang" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Judul" }), { target: { value: "Info parkir" } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(request).not.toHaveBeenCalled();
    const confirm = await screen.findByRole("dialog", { name: "Kirim pengumuman?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Kirim sekarang" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/wam/announcements", { method: "POST", json: { title: "Info parkir", body: "", audience: { type: "semua" } } }));
    expect(await screen.findByText("Terkirim ke 40 orang.")).toBeTruthy();
  });
});
