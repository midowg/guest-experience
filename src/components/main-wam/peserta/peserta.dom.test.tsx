import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { ONBOARDED_KEY } from "@/lib/main-wam/peserta/onboarding";
import { groupNotifications } from "@/lib/main-wam/peserta/notifications";
import { sampleNotifications, sampleSessionIds } from "@/lib/main-wam/sample";
import { mainWamApi, mainWamPath, praWamApi } from "@/lib/routes";
import { NowCard } from "./beranda/NowCard";
import { HomeCard } from "./beranda/HomeCard";
import { InfoLainnya } from "./agenda/InfoLainnya";
import { LoginScreen } from "./masuk/LoginScreen";
import { NotificationsScreen } from "./notifikasi/NotificationsScreen";
import { HelpScreen } from "./saya/HelpScreen";
import { MainWamModeSetting } from "@/components/main-wam/theme/MainWamModeSetting";
import { LangProvider } from "@/components/main-wam/i18n";
import { setActiveLang } from "@/lib/main-wam/i18n";
import { SayaScreen } from "./saya/SayaScreen";

/* Agen A's main components as people use them: what shows, what a tap does, what is sent. */

const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/wam2026" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
beforeEach(() => { window.history.replaceState(null, "", "/wam2026"); Object.values(router).forEach(fn => fn.mockClear()); localStorage.clear(); });
afterEach(() => { cleanup(); setActiveLang("id"); vi.unstubAllGlobals(); vi.useRealTimers(); });

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
    // B10: the check-in is a line in the foot; the eyebrow stays Berikutnya, so the Sesi pill keeps its place beside it.
    expect(screen.getByText("Berikutnya").closest("span")?.textContent).not.toMatch(/Hadir/);
    expect(screen.getByText("Hadir 07.52").closest("div")?.className).toMatch(/foot/);
    expect(screen.getByText("Sesi")).toBeTruthy();
  });

  it("the day is done: tomorrow's first session, opening that day of the agenda", () => {
    render(<NowCard serverNow={NOW} view={{ kind: "selesai", tomorrow: { title: "Trekking Coban Rondo", when: "Besok 06.00", day: 3 } }} />);
    expect(screen.getByText("Hari ini selesai")).toBeTruthy();
    expect(screen.getByText("Besok 06.00 · Trekking Coban Rondo")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe(mainWamPath.agenda(3));
  });

  it("the contextual card: a pinned announcement opens its sheet in Notifikasi; Silent Meeting its screen", () => {
    const { unmount } = render(<HomeCard card={{ kind: "pengumuman", id: "abc", title: "Ke Aula Utama lewat lobby timur", body: "Lift barat sedang dirawat.", tone: "info" }} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe(`${mainWamPath.notifications}#kabar-abc`);
    expect(screen.getByRole("link").className).not.toMatch(/warning/);
    expect(screen.getByRole("link").querySelector("svg.lucide-megaphone")).toBeTruthy();
    unmount();
    // P02__status: a changed gathering time reads as a warning, with the schedule icon.
    const warned = render(<HomeCard card={{ kind: "pengumuman", id: "k", title: "Kumpul jadi 05.30", body: "Tadinya 05.45.", tone: "warning" }} />);
    expect(screen.getByRole("link", { name: /Kumpul jadi 05\.30/ }).className).toMatch(/warning/);
    expect(screen.getByRole("link").querySelector("svg.lucide-calendar-clock")).toBeTruthy();
    warned.unmount();
    render(<HomeCard card={{ kind: "silent", title: "Silent Meeting dibuka", sub: "Tanpa nama · sampai 15.00", action: "Kirim masukan", target: { silentSession: "s1" } }} />);
    expect(screen.getByRole("link", { name: "Kirim masukan" }).getAttribute("href")).toBe(mainWamPath.silentMeeting("s1"));
  });
});

describe("Info lainnya", () => {
  it("is closed until tapped, then shows the order, the snacks and the panitia to call", () => {
    render(<InfoLainnya sub="Urutan, konsumsi, panitia" lineup={[{ time: "08.00", label: "Sales & Marketing" }]} meal="10.00 Rehat"
      contact={{ id: "d", name: "Dimas", role: "Panitia", photo: null, tel: "tel:+6280000000001", whatsapp: "https://wa.me/6280000000001" }} />);
    const toggle = screen.getByRole("button", { name: /Info lainnya/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Sales & Marketing").closest("[hidden]")).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Sales & Marketing").closest("[hidden]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hubungi Dimas" }));
    expect(screen.getByRole("dialog", { name: "Hubungi panitia" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /WhatsApp/ }).getAttribute("href")).toBe("https://wa.me/6280000000001");
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
    // T-P01: each row says its news; the two kinds' own words are not what the rows say.
    expect(screen.getByRole("button", { name: /Pemaparan selesai 12\.30/ })).toBeTruthy();
    for (const text of ["Dimas dan 4 lainnya bereaksi di fotomu", "Absen tercatat: Pemaparan departemen", "Kamarmu siap: Kamar 208, lantai 2"]) expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByText("Jadwal berubah")).toBeNull();
    expect(screen.queryByText("Momen")).toBeNull();
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
  const props = { name: "Rani", fullName: "Rani Contoh", line: "CoE", photo: null, room: { title: "Kamar 208", sub: "3 orang · bersama Sari, Dewi" } };

  it("the profile card opens Foto profil; the room opens Kamar; Jejak karbon only while its module is on", () => {
    const { unmount } = render(<SayaScreen {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Rani Contoh.*ganti foto profil/ }));
    expect(screen.getByRole("dialog", { name: "Foto profil" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Kamar 208/ }).getAttribute("href")).toBe(mainWamPath.room);
    expect(screen.queryByRole("link", { name: /Jejak karbon/ })).toBeNull();
    expect(screen.queryByText(/Kelompok/)).toBeNull();
    unmount();
    render(<SayaScreen {...props} carbon />);
    expect(screen.getByRole("link", { name: /Jejak karbon/ }).getAttribute("href")).toBe(mainWamPath.carbon("saya"));
  });

  it("shows the call name on the card, and the tokoh and Misi rows only when their data is there", () => {
    const { unmount } = render(<SayaScreen {...props} />);
    expect(screen.queryByText(/Marie Curie/)).toBeNull();
    expect(screen.queryByRole("link", { name: /Misi dan poin/ })).toBeNull();
    unmount();
    render(<SayaScreen {...props} figure={{ name: "Marie Curie", persona: "Pemikir", colors: ["#111111", "#222222"] }} points={340} />);
    expect(screen.getByText("Rani", { selector: "span" })).toBeTruthy();
    // The tokoh is one small line under the name on the profile card (name, tokoh, job line), with no card of its own and no word about the quiz.
    const card = screen.getByText("Rani", { selector: "span" }).closest("button")!;
    const nameLine = screen.getByText("Rani", { selector: "span" });
    const tokohLine = [...card.querySelectorAll("span")].find(line => line.textContent === "Tokoh: Marie Curie")!;
    expect(nameLine.compareDocumentPosition(tokohLine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.textContent).toContain("Tokoh: Marie Curie");
    expect(screen.queryByText("Tokoh WAM-mu")).toBeNull();
    expect(document.body.textContent).not.toMatch(/kuis|Tipe Pemikir/i);
    expect(screen.getByRole("link", { name: /Misi dan poin.*340 poin/ }).getAttribute("href")).toBe(mainWamPath.missions);
  });

  it("writes the Misi points with the thousands dot, like the Misi page (3.400, not 3400)", () => {
    render(<SayaScreen {...props} points={3400} />);
    expect(screen.getByRole("link", { name: /Misi dan poin.*3\.400 poin/ })).toBeTruthy();
  });

  it("Bantuan is a page of its own (a link, not a sheet)", () => {
    render(<SayaScreen {...props} />);
    expect(screen.getByRole("link", { name: "Bantuan" }).getAttribute("href")).toBe(mainWamPath.help);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Keluar asks first, then signs out and leaves", async () => {
    const fetch = answer(200, { ok: true, data: null });
    vi.stubGlobal("fetch", fetch);
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign, pathname: "/wam2026/saya", search: "" });
    render(<SayaScreen {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Keluar" }));
    const dialog = screen.getByRole("alertdialog", { name: "Keluar dari WAM?" });
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(dialog.querySelector("button")!);
    await waitFor(() => expect(assign).toHaveBeenCalledWith(mainWamPath.login()));
    expect(fetch).toHaveBeenCalledWith(praWamApi.logout, expect.objectContaining({ method: "POST" }));
  });
});

describe("Bantuan", () => {
  it("has the how-to, the common questions and the panitia contact", () => {
    const help = { id: "p1", name: "Dimas", role: "Panitia", photo: null, tel: "tel:0800", whatsapp: "https://wa.me/62800" };
    render(<HelpScreen help={help} />);
    for (const name of ["Cara pakai", "Pertanyaan umum", "Masih butuh bantuan?"]) expect(screen.getByRole("heading", { name })).toBeTruthy();
    for (const text of ["Bagaimana cara absen?", "Bagaimana cara mengirim foto?", "Notifikasi tidak muncul", "Cara memasang WAM ke layar utama"]) expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Buka Pengaturan/ }).getAttribute("href")).toBe(mainWamPath.settings);
    fireEvent.click(screen.getByRole("button", { name: "Hubungi Dimas" }));
    expect(screen.getByRole("dialog", { name: "Hubungi panitia" })).toBeTruthy();
  });

  it("speaks English when the language is English", () => {
    const help = { id: "p1", name: "Dimas", role: "Panitia", photo: null, tel: "tel:0800", whatsapp: "https://wa.me/62800" };
    render(<LangProvider lang="en"><HelpScreen help={help} /></LangProvider>);
    for (const name of ["How to use", "Common questions", "Still need help?"]) expect(screen.getByRole("heading", { name })).toBeTruthy();
    expect(screen.getByText("How do I check in?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Contact Dimas" }));
    expect(screen.getByRole("dialog", { name: "Contact the committee" })).toBeTruthy();
  });

  it("Tampilan / Appearance options follow the language", () => {
    render(<LangProvider lang="en"><MainWamModeSetting initial="system" /></LangProvider>);
    for (const name of ["Light", "Dark", "System"]) expect(screen.getByRole("radio", { name })).toBeTruthy();
  });

  it("without a contact, no contact block", () => {
    render(<HelpScreen help={null} />);
    expect(screen.queryByRole("heading", { name: "Masih butuh bantuan?" })).toBeNull();
  });
});

describe("Masuk", () => {
  const fill = () => {
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "rani@example.com" } });
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
    fireEvent.click(screen.getByRole("button", { name: "Lupa password? Minta panitia untuk reset." }));
    const dialog = screen.getByRole("dialog", { name: "Minta reset password" });
    fireEvent.change(dialog.querySelector("input")!, { target: { value: "rani@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim permintaan" }));
    expect(await screen.findByText("Permintaan terkirim ke panitia.")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(praWamApi.forgot, expect.objectContaining({ body: JSON.stringify({ email: "rani@example.com" }) }));
  });
});

describe("Izin notifikasi (T-P02): only modules that are on", () => {
  it("Absen QR and Silent Meeting off: no Absen reason, no Silent Meeting in the example", async () => {
    const { OnboardingScreen } = await import("./mulai/OnboardingScreen");
    const { unmount } = render(<OnboardingScreen name="Rani" modules={{ absen: false, silent: false }} preview={{ push: "off" }} />);
    expect(screen.getByText("Panggilan kumpul")).toBeTruthy();
    expect(screen.queryByText("Absen dibuka")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Silent Meeting/);
    expect(screen.getByText("Team building mundur ke 15.30.")).toBeTruthy();
    unmount();
    render(<OnboardingScreen name="Rani" modules={{ absen: true, silent: true }} preview={{ push: "off" }} />);
    expect(screen.getByText("Absen dibuka")).toBeTruthy();
    expect(screen.getByText("Silent Meeting mundur ke 13.30.")).toBeTruthy();
  });
});

describe("Izin notifikasi: Izinkan ends in a toast (O02)", () => {
  it("after the phone says yes: 'Notifikasi aktif di HP ini' is shown, then Beranda opens", async () => {
    vi.resetModules();
    const enable = vi.fn(async () => true);
    vi.doMock("./usePushDevice", () => ({ usePushDevice: () => ({ state: "off", busy: false, message: null, enable, disable: vi.fn(), test: vi.fn() }) }));
    const { OnboardingScreen } = await import("./mulai/OnboardingScreen");
    const { ToastProvider } = await import("@/components/main-wam/ui");
    render(<ToastProvider><OnboardingScreen name="Rani" modules={{ absen: true, silent: false }} /></ToastProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Izinkan" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(mainWamPath.home));
    expect(enable).toHaveBeenCalled();
    expect(screen.getByText("Notifikasi aktif di HP ini.")).toBeTruthy();
    vi.doUnmock("./usePushDevice");
  });
});

describe("RefreshAt (S6): the server's clock, spread out, set again after each refresh", () => {
  it("a phone 2 minutes fast still refreshes when the session really starts, 0–20 s late", async () => {
    const { RefreshAt } = await import("./Live");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-05T08:02:00+07:00"));
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const at = "2027-01-05T08:01:00+07:00";
    const { rerender } = render(<RefreshAt at={at} serverNow="2027-01-05T08:00:00+07:00" />);
    // By the server, 60 s to go, + 1 s, + 10 s spread. (By the phone's own clock it had already passed: the old code never refreshed.)
    act(() => { vi.advanceTimersByTime(70_999); });
    expect(router.refresh).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(router.refresh).toHaveBeenCalledTimes(1);
    // The refresh came back with the same change still ahead (a new serverNow): the timer is set again.
    rerender(<RefreshAt at={at} serverNow="2027-01-05T08:00:50+07:00" />);
    act(() => { vi.advanceTimersByTime(21_000); });
    expect(router.refresh).toHaveBeenCalledTimes(2);
    random.mockRestore();
  });
});

describe("O01 Splash", () => {
  const props = { title: "WAM 2026", subtitle: "Werkudara Annual Meeting 2026", dates: "4–7 Januari 2027", venue: "Kota Batu", image: false };
  const hydrate = async () => {
    vi.resetModules();
    const { Splash } = await import("./masuk/Splash");
    const { renderToString } = await import("react-dom/server");
    const { hydrateRoot } = await import("react-dom/client");
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = renderToString(<Splash {...props} />);
    const root = await act(async () => hydrateRoot(container, <Splash {...props} />));
    return { container, root, splash: () => container.querySelector("[data-testid=splash]") };
  };
  beforeEach(() => { sessionStorage.clear(); });

  it("opens the app (server page): pill with name, dates and place, the tagline, and Masuk lifts it", async () => {
    const { splash, root, container } = await hydrate();
    expect(splash()?.textContent).toBe("WAM 2026 · 4–7 Januari 2027 · Kota BatuShaping for tomorrowWerkudara Annual Meeting 2026Masuk");
    expect(splash()?.querySelector("h1")?.textContent).toBe("Shaping for tomorrow");
    // It does not leave by itself, nor by a tap on the art: only Masuk.
    fireEvent.pointerDown(splash()!);
    expect(splash()).toBeTruthy();
    fireEvent.click(within(splash() as HTMLElement).getByRole("button", { name: "Masuk" }));
    expect(splash()).toBeNull();
    root.unmount(); container.remove();
  });

  it("keeps the sign-in beneath out of reach (inert) while it is up, and gives it back after Masuk", async () => {
    vi.resetModules();
    const { Splash } = await import("./masuk/Splash");
    const { renderToString } = await import("react-dom/server");
    const { hydrateRoot } = await import("react-dom/client");
    const Page = () => <div><Splash {...props} /><main data-testid="beneath"><h1>Masuk</h1><button type="button">Kirim</button></main></div>;
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = renderToString(<Page />);
    // Without the script the page is plain: the sign-in is not inert.
    expect(container.querySelector("[data-testid=beneath]")?.hasAttribute("inert")).toBe(false);
    const root = await act(async () => hydrateRoot(container, <Page />));
    const beneath = () => container.querySelector("[data-testid=beneath]") as HTMLElement;
    expect(beneath().inert).toBe(true);
    fireEvent.click(within(container.querySelector("[data-testid=splash]") as HTMLElement).getByRole("button", { name: "Masuk" }));
    expect(beneath().inert).toBe(false);
    root.unmount(); container.remove();
  });

  it("once per session, and an in-app navigation never shows it", async () => {
    const first = await hydrate();
    expect(first.splash()).toBeTruthy();
    first.root.unmount(); first.container.remove();
    // The next page load in this session: gone at once, Masuk is right there.
    const again = await hydrate();
    expect(again.splash()).toBeNull();
    again.root.unmount(); again.container.remove();
    // Drawn on the client (Masuk reached inside the app): no splash.
    const { Splash } = await import("./masuk/Splash");
    render(<Splash {...props} />);
    expect(screen.queryByTestId("splash")).toBeNull();
  });

  it("with Admin WAM's splash image: the image and the Masuk button only (from the theme), no words over it", async () => {
    const { Splash } = await import("./masuk/Splash");
    render(<Splash {...props} image hold />);
    expect(screen.getByTestId("splash").textContent).toBe("Masuk");
    expect(screen.getByTestId("splash").className).toMatch(/splashImage/);
  });
});

describe("Agenda (T-P03, T-P04)", () => {
  it("while loading: four day tabs and rows as tall as a session row, in the real bar", async () => {
    const { AgendaSkeleton } = await import("./Skeletons");
    const { container } = render(<AgendaSkeleton />);
    expect(container.querySelectorAll("[class*=skeletonTabs] > *")).toHaveLength(4);
    expect(container.querySelector("[class*=dayBar] [class*=dayTabs]")).toBeTruthy();
    expect(container.querySelectorAll("[class*=skeletonSessions] > *")).toHaveLength(5);
  });

  it("the day tabs carry the class that puts them in two rows at zoom 200%", async () => {
    const { AgendaScreen } = await import("./agenda/AgendaScreen");
    const { agendaDays } = await import("@/lib/main-wam/peserta/agenda");
    render(<AgendaScreen migrated days={agendaDays({ startDate: "2027-01-04", endDate: "2027-01-07" }, "2027-01-05")} day={2} rows={[]} anyPublished since="07.38" />);
    expect(screen.getByRole("navigation", { name: "Hari acara" }).className).toMatch(/dayTabs/);
    expect(screen.getAllByRole("link", { name: /Hari \d/ })).toHaveLength(4);
  });
});
