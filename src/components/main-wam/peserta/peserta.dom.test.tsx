import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ONBOARDED_KEY } from "@/lib/main-wam/peserta/onboarding";
import { groupNotifications } from "@/lib/main-wam/peserta/notifications";
import { sampleNotifications, sampleSessionIds } from "@/lib/main-wam/sample";
import { mainWamApi, mainWamPath, praWamApi, praWamPath } from "@/lib/routes";
import { NowCard } from "./beranda/NowCard";
import { HomeCard } from "./beranda/HomeCard";
import { InfoLainnya } from "./agenda/InfoLainnya";
import { LoginScreen } from "./masuk/LoginScreen";
import { NotificationsScreen } from "./notifikasi/NotificationsScreen";
import { SayaScreen } from "./saya/SayaScreen";

/* Agen A's main components as people use them: what shows, what a tap does, what is sent. */

const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/wam/acara" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
beforeEach(() => { window.history.replaceState(null, "", "/wam/acara"); Object.values(router).forEach(fn => fn.mockClear()); localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
const NOW = "2027-01-05T07:40:00+07:00";

describe("Kartu Sekarang", () => {
  const base = { kind: "sesi" as const, sessionId: sampleSessionIds.pemaparan, title: "Pemaparan departemen", time: "08.00–12.00", place: "Aula Utama" };

  it("absen open: the session links to Detail sesi and agen D's Absen sits beside the link", () => {
    render(<NowCard serverNow={NOW} view={{ ...base, status: "next", statusText: null, when: "20 menit lagi", whenAt: "2027-01-05T08:00:00+07:00", absen: true }}
      absen={<button type="button">Absen</button>} />);
    const link = screen.getByRole("link", { name: /Pemaparan departemen/ });
    expect(link.getAttribute("href")).toBe(mainWamPath.session(sampleSessionIds.pemaparan));
    expect(screen.getByText("Berikutnya")).toBeTruthy();
    expect(screen.getByText("20 menit lagi")).toBeTruthy();
    expect(link.contains(screen.getByRole("button", { name: "Absen" }))).toBe(false);
  });

  it("checked in: Hadir 07.52 and no Absen, even when the slot is given", () => {
    render(<NowCard serverNow={NOW} view={{ ...base, status: "present", statusText: "Hadir 07.52", when: "8 menit lagi", whenAt: null, absen: false }} absen={<button type="button">Absen</button>} />);
    expect(screen.getByText("Hadir 07.52")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Absen" })).toBeNull();
  });

  it("the day is done: tomorrow's first session, opening that day of the agenda", () => {
    render(<NowCard serverNow={NOW} view={{ kind: "selesai", tomorrow: { title: "Trekking Coban Rondo", when: "Besok 06.00", day: 3 } }} />);
    expect(screen.getByText("Hari ini selesai")).toBeTruthy();
    expect(screen.getByText("Besok 06.00 · Trekking Coban Rondo")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe(mainWamPath.agenda(3));
  });

  it("the contextual card: a pinned announcement opens its sheet in Notifikasi; Silent Meeting its screen", () => {
    const { unmount } = render(<HomeCard card={{ kind: "pengumuman", id: "abc", title: "Ke Aula Utama lewat lobby timur", body: "Lift barat sedang dirawat." }} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe(`${mainWamPath.notifications}#kabar-abc`);
    unmount();
    render(<HomeCard card={{ kind: "silent", title: "Silent Meeting dibuka", sub: "Tanpa nama · sampai 15.00", action: "Kirim masukan", target: { silentSession: "s1" } }} />);
    expect(screen.getByRole("link", { name: "Kirim masukan" }).getAttribute("href")).toBe(mainWamPath.silentMeeting("s1"));
  });
});

describe("Info lainnya", () => {
  it("is closed until tapped, then shows the order, the snacks and the panitia to call", () => {
    render(<InfoLainnya sub="Urutan, konsumsi, panitia" lineup={[{ time: "08.00", label: "Sales & Marketing" }]} meal="10.00 Rehat"
      contact={{ id: "d", name: "Dimas", role: "Panitia", photo: null, tel: "tel:+6281", whatsapp: "https://wa.me/6281" }} />);
    const toggle = screen.getByRole("button", { name: /Info lainnya/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Sales & Marketing").closest("[hidden]")).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Sales & Marketing").closest("[hidden]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hubungi Dimas" }));
    expect(screen.getByRole("dialog", { name: "Hubungi panitia" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /WhatsApp/ }).getAttribute("href")).toBe("https://wa.me/6281");
  });
});

describe("Notifikasi", () => {
  const grouped = groupNotifications(sampleNotifications, new Date("2027-01-05T10:35:00+07:00"));

  it("one line per note, unread marked; a panitia's announcement opens in a sheet; opening marks all read", async () => {
    const fetch = answer(200, { ok: true, data: null });
    vi.stubGlobal("fetch", fetch);
    vi.useFakeTimers();
    render(<NotificationsScreen migrated {...grouped} unread={3} />);
    expect(screen.getAllByRole("img", { name: "Belum dibaca" })).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: /Team building mulai 15.00 di Lawn/ }));
    expect(window.location.hash).toBe(`#kabar-${sampleNotifications[0].id}`);
    expect(screen.getByRole("dialog", { name: "Team building mulai 15.00 di Lawn" }).textContent).toContain("Pakai kaos tim");
    await act(async () => { vi.advanceTimersByTime(1_600); });
    vi.useRealTimers();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(mainWamApi.notifications, expect.objectContaining({ method: "POST" })));
  });

  it("nothing yet: says so", () => {
    vi.stubGlobal("fetch", answer(200, { ok: true, data: null }));
    render(<NotificationsScreen migrated today={[]} earlier={[]} unread={0} preview={{ push: "on" }} />);
    expect(screen.getByRole("heading", { name: "Belum ada notifikasi" })).toBeTruthy();
  });
});

describe("Saya", () => {
  const props = { name: "Rani", fullName: "Rani Contoh", line: "CoE · Kelompok 4 · Arjuno", photo: null, room: { title: "Kamar 208", sub: "3 orang · bersama Sari, Dewi" }, mcp: false, help: null };

  it("the profile card opens Foto profil; the room opens Kelompok & kamar; Akses MCP only with access", () => {
    const { unmount } = render(<SayaScreen {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Rani Contoh, ganti foto profil" }));
    expect(screen.getByRole("dialog", { name: "Foto profil" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Kamar 208/ }).getAttribute("href")).toBe(mainWamPath.groupRoom);
    expect(screen.queryByRole("link", { name: /Akses MCP/ })).toBeNull();
    unmount();
    render(<SayaScreen {...props} mcp />);
    expect(screen.getByRole("link", { name: /Akses MCP/ }).getAttribute("href")).toBe(`${praWamPath.settings}#mcp`);
  });

  it("Keluar asks first, then signs out and leaves", async () => {
    const fetch = answer(200, { ok: true, data: null });
    vi.stubGlobal("fetch", fetch);
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign, pathname: "/wam/acara/saya", search: "" });
    render(<SayaScreen {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Keluar" }));
    const dialog = screen.getByRole("alertdialog", { name: "Keluar dari WAM?" });
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(dialog.querySelector("button")!);
    await waitFor(() => expect(assign).toHaveBeenCalledWith(mainWamPath.login()));
    expect(fetch).toHaveBeenCalledWith(praWamApi.logout, expect.objectContaining({ method: "POST" }));
  });
});

describe("Masuk", () => {
  const fill = () => {
    fireEvent.change(screen.getByLabelText("Email atau nama panggilan"), { target: { value: "rani@contoh.id" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "rahasia-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Masuk" }));
  };

  it("a wrong password: the words under the field, what was typed stays", async () => {
    vi.stubGlobal("fetch", answer(401, { ok: false, message: "Email/nama panggilan atau password tidak cocok. Periksa lalu coba lagi." }));
    render(<LoginScreen next={mainWamPath.home} eventName="WAM 2026" />);
    fill();
    expect(await screen.findByText("Email/nama panggilan atau password tidak cocok. Periksa lalu coba lagi.")).toBeTruthy();
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("rahasia-1");
    expect((screen.getByLabelText("Password") as HTMLInputElement).getAttribute("aria-invalid")).toBe("true");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("first sign-in on this phone: to Izin notifikasi; after that: straight on", async () => {
    vi.stubGlobal("fetch", answer(200, { ok: true, data: { mustChangePassword: false, askNewPassword: false } }));
    const { unmount } = render(<LoginScreen next={mainWamPath.home} eventName="WAM 2026" />);
    fill();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(mainWamPath.onboarding));
    unmount();
    localStorage.setItem(ONBOARDED_KEY, "1");
    render(<LoginScreen next={mainWamPath.home} eventName="WAM 2026" />);
    fill();
    await waitFor(() => expect(router.replace).toHaveBeenLastCalledWith(mainWamPath.home));
  });

  it("too many tries: locked with the time to try again", async () => {
    vi.stubGlobal("fetch", answer(429, { ok: false, message: "Terlalu banyak permintaan." }));
    render(<LoginScreen next={mainWamPath.home} eventName="WAM 2026" />);
    fill();
    expect(await screen.findByText(/Terlalu banyak percobaan. Coba lagi pukul \d{2}\.\d{2}\./)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Masuk" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Lupa password: asks the panitia, then says it was sent", async () => {
    const fetch = answer(200, { ok: true, data: { sent: true }, message: "Permintaan tercatat." });
    vi.stubGlobal("fetch", fetch);
    render(<LoginScreen next={mainWamPath.home} eventName="WAM 2026" />);
    fireEvent.click(screen.getByRole("button", { name: "Lupa password?" }));
    const dialog = screen.getByRole("dialog", { name: "Minta reset password" });
    fireEvent.change(dialog.querySelector("input")!, { target: { value: "rani@contoh.id" } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim permintaan" }));
    expect(await screen.findByText("Permintaan terkirim ke panitia.")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(praWamApi.forgot, expect.objectContaining({ body: JSON.stringify({ email: "rani@contoh.id" }) }));
  });
});
