import axe from "axe-core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { LangProvider } from "@/components/main-wam/i18n";
import { ActionsSlotContext } from "@/components/main-wam/shell/ShellSlots";
import { setActiveLang } from "@/lib/main-wam/i18n";
import { missionItems, summarize, type MisiView, type MissionItem } from "@/lib/main-wam/misi/missions";
import { rankPeople } from "@/lib/main-wam/misi/rank";
import { sampleBoard, sampleCompletions, sampleMissions } from "@/lib/main-wam/misi/sample";
import { mainWamPath } from "@/lib/routes";
import { sampleSessionIds } from "@/lib/main-wam/sample";
import { MisiCard } from "./MisiCard";
import { MisiScreen } from "./MisiScreen";
import { MissionCamera } from "./MissionCamera";
import { MissionCheckIn } from "./MissionCheckIn";
import { PlaceBanner } from "./PlaceBanner";
import { RankScreen } from "./RankScreen";

/* Misi as people use it: Beranda's card, the page and its sheet, the Peringkat, the camera and the check-in. */

const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/wam/acara/misi" }));
vi.mock("@/components/main-wam/theme/font", () => ({ mainWamFontVars: "" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  HTMLMediaElement.prototype.play = () => Promise.resolve();
});
beforeEach(() => { window.history.replaceState(null, "", "/wam/acara/misi"); Object.values(router).forEach(fn => fn.mockClear()); });
afterEach(() => { cleanup(); setActiveLang("id"); vi.unstubAllGlobals(); });

const NOW = new Date("2027-01-05T10:00:00+07:00");
const ME = "00000000-0000-4000-8001-000000000001";

function viewOf(completions = sampleCompletions(ME), over: Partial<MisiView> = {}): MisiView {
  const items = missionItems(sampleMissions, completions, { sessions: [{ id: sampleSessionIds["team-building"], title: "Team building" }], settings: { defaultRadiusM: 50 }, now: NOW });
  return { migrated: true, sample: false, items, summary: summarize(items), points: 340, place: { rank: 7, of: 118 }, leaderboardOpen: true, ...over };
}
const itemOf = (id: string): MissionItem => viewOf().items.find(item => item.title === id)!;

async function violations(): Promise<string[]> {
  const result = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  return result.violations.map(violation => `${violation.id}: ${violation.nodes.map(node => node.html.slice(0, 160)).join(" | ")}`);
}

describe("kartu Misi di Beranda", () => {
  it("is one link to the page with the points, the progress in words and the next mission with what it asks", () => {
    render(<MisiCard view={viewOf()} />);
    const card = screen.getByRole("link");
    expect(card.getAttribute("href")).toBe(mainWamPath.missions);
    expect(card.textContent).toContain("340");
    expect(card.textContent).toContain("poin");
    expect(card.textContent).toContain("Misi berikutnya · +50");
    expect(card.textContent).toContain("Bagikan cerita di Team building");
    expect(card.textContent).toContain("Selesai di sesi");
    expect(screen.getByRole("img", { name: "2 dari 5 misi selesai" })).toBeTruthy();
  });

  it("says what is left when nothing can be started", async () => {
    const allDone = viewOf(sampleMissions.map((mission, index) => ({ ...sampleCompletions(ME)[0], id: `c${index}`, missionId: mission.id })));
    const { rerender } = render(<MisiCard view={allDone} />);
    expect(screen.getByRole("link").textContent).toContain("Semua misi selesai");
    rerender(<MisiCard view={viewOf([], { items: [], summary: summarize([]) })} />);
    expect(screen.getByRole("link").textContent).toContain("Belum ada misi");
    rerender(<MisiCard view={{ ...viewOf(), migrated: false }} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(await violations()).toEqual([]);
  });

  it("speaks English", () => {
    render(<LangProvider lang="en"><MisiCard view={viewOf()} /></LangProvider>);
    expect(screen.getByRole("link").textContent).toContain("Next mission · +50");
    expect(screen.getByRole("link").textContent).toContain("Missions");
  });
});

describe("halaman Misi", () => {
  it("shows the points, the place, the ring and the two sections (still to do on top, done below)", async () => {
    const { container } = render(<MisiScreen view={viewOf()} />);
    expect(container.textContent).toContain("Poinmu");
    expect(container.textContent).toContain("340");
    expect(container.textContent).toContain("Peringkat 7 dari 118");
    expect(screen.getByRole("img", { name: "2 dari 5 misi selesai" })).toBeTruthy();
    const todo = screen.getByRole("region", { name: /Belum selesai · 3/ });
    const done = screen.getByRole("region", { name: /Berhasil · 2/ });
    expect(todo.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(todo).getAllByRole("button")).toHaveLength(3);
    expect(within(done).getAllByRole("button")).toHaveLength(2);
    expect(todo.textContent).toContain("+120 poin tersedia");
    expect(done.textContent).toContain("+50 poin diraih");
    expect(await violations()).toEqual([]);
  });

  it("filters Semua, Belum and Berhasil, with the counts in the words", () => {
    render(<MisiScreen view={viewOf()} />);
    const chips = screen.getByRole("group", { name: "Saring misi" });
    expect(within(chips).getByRole("button", { name: "Semua 5" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(chips).getByRole("button", { name: "Berhasil 2" }));
    expect(screen.queryByRole("region", { name: /Belum selesai/ })).toBeNull();
    expect(screen.getByRole("region", { name: /Berhasil · 2/ })).toBeTruthy();
    fireEvent.click(within(chips).getByRole("button", { name: "Belum 3" }));
    expect(screen.queryByRole("region", { name: /Berhasil/ })).toBeNull();
    expect(screen.getByRole("region", { name: /Belum selesai · 3/ })).toBeTruthy();
  });

  it("orders by points, highest first, and the other way from the sort sheet", () => {
    render(<MisiScreen view={viewOf()} />);
    const titles = () => within(screen.getByRole("region", { name: /Belum selesai/ })).getAllByRole("button").map(row => row.textContent ?? "");
    expect(titles()[0]).toContain("Bagikan cerita di Team building");
    fireEvent.click(screen.getByRole("button", { name: /Urutkan poin/ }));
    fireEvent.click(screen.getByRole("button", { name: "Terendah dulu" }));
    expect(titles()[0]).toContain("Jelajah Taman Kota");
    expect(screen.getByRole("button", { name: /Poin, terendah dulu/ })).toBeTruthy();
  });

  it("opens a sheet with only the description, 'Syarat dapat poin' and one button (no camera in it)", async () => {
    const { baseElement } = render(<MisiScreen view={viewOf()} />);
    fireEvent.click(screen.getByRole("button", { name: /Foto apel Kota Batu/ }));
    const sheet = screen.getByRole("dialog");
    expect(sheet.textContent).toContain("Misi 3 dari 5");
    expect(sheet.textContent).toContain("+40 poin");
    expect(sheet.textContent).toContain("Foto dirimu atau timmu di depan tugu apel Alun-alun Batu.");
    expect(sheet.textContent).toContain("Syarat dapat poin");
    expect(sheet.textContent).toContain("Foto langsung dari kamera");
    expect(sheet.textContent).toContain("Berada dalam radius 50 m dari Alun-alun Batu saat memotret.");
    const go = within(sheet).getByRole("link", { name: "Kerjakan misi" });
    expect(go.getAttribute("href")).toBe(mainWamPath.missionDo(sampleMissions[2].id));
    expect(baseElement.querySelector("video, input[type=file], canvas")).toBeNull();
    expect(await violations()).toEqual([]);
  });

  it("sends a session mission to its session, and shows a done one as done", () => {
    render(<MisiScreen view={viewOf()} />);
    fireEvent.click(screen.getByRole("button", { name: /Bagikan cerita di Team building/ }));
    expect(within(screen.getByRole("dialog")).getByRole("link", { name: "Kerjakan misi" }).getAttribute("href")).toBe(mainWamPath.session(sampleSessionIds["team-building"]));
    cleanup();
    render(<MisiScreen view={viewOf()} />);
    fireEvent.click(screen.getByRole("button", { name: /Foto bareng tim di Aula/ }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).queryByRole("link", { name: "Kerjakan misi" })).toBeNull();
    expect((within(sheet).getByRole("button", { name: "Misi selesai" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("explains a waiting and a turned-down mission, and a mission that is closed or not open yet", () => {
    const waiting = viewOf([{ ...sampleCompletions(ME)[0], missionId: sampleMissions[2].id, status: "menunggu" }]);
    render(<MisiScreen view={waiting} />);
    expect(screen.getByRole("button", { name: /Foto apel Kota Batu/ }).textContent).toContain("Menunggu persetujuan");
    fireEvent.click(screen.getByRole("button", { name: /Foto apel Kota Batu/ }));
    expect((within(screen.getByRole("dialog")).getByRole("button", { name: "Menunggu persetujuan" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    const rejected = viewOf([{ ...sampleCompletions(ME)[0], missionId: sampleMissions[2].id, status: "ditolak", reviewNote: "Bukan di tugu" }]);
    render(<MisiScreen view={rejected} />);
    fireEvent.click(screen.getByRole("button", { name: /Foto apel Kota Batu/ }));
    const sheet = screen.getByRole("dialog");
    expect(sheet.textContent).toContain("Kiriman sebelumnya ditolak");
    expect(sheet.textContent).toContain("Catatan panitia: Bukan di tugu");
    expect(within(sheet).getByRole("link", { name: "Kerjakan misi" })).toBeTruthy();
  });

  it("has a Peringkat button at the end of the top bar while the Peringkat is open, and none when it is closed", () => {
    const slot = document.createElement("div");
    document.body.appendChild(slot);
    const { rerender } = render(<ActionsSlotContext.Provider value={slot}><MisiScreen view={viewOf()} /></ActionsSlotContext.Provider>);
    expect(within(slot).getByRole("link", { name: "Peringkat" }).getAttribute("href")).toBe(mainWamPath.missionRank);
    rerender(<ActionsSlotContext.Provider value={slot}><MisiScreen view={viewOf(undefined, { leaderboardOpen: false })} /></ActionsSlotContext.Provider>);
    expect(within(slot).queryByRole("link", { name: "Peringkat" })).toBeNull();
    expect(document.body.textContent).not.toContain("Peringkat 7 dari 118");
  });

  it("waits kindly before its migration, and says so when there is no mission", () => {
    const { rerender } = render(<MisiScreen view={{ ...viewOf(), migrated: false }} />);
    expect(screen.getByText("Misi belum bisa dibuka. Coba lagi nanti.")).toBeTruthy();
    rerender(<MisiScreen view={{ ...viewOf(), items: [], summary: summarize([]) }} />);
    expect(screen.getByText("Belum ada misi")).toBeTruthy();
  });
});

describe("Peringkat", () => {
  const rows = rankPeople(sampleBoard(ME, "Rani"), ME);

  it("lists everyone ranked: medals for the first three, the asker lit and called Kamu, the department short", async () => {
    const { container } = render(<RankScreen migrated open rows={rows} />);
    const list = screen.getByRole("list", { name: "Daftar peringkat" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(118);
    expect(container.querySelectorAll("li svg")).toHaveLength(3);
    const mine = container.querySelector("[aria-current='true']")!;
    expect(mine.textContent).toContain("Rani");
    expect(mine.textContent).toContain("Kamu");
    expect(mine.textContent).toContain("340");
    expect(container.textContent).toContain("Kamu di peringkat 7 dari 118 peserta · 340 poin");
    expect(await violations()).toEqual([]);
  });

  it("shows nothing about a person but a name, a short department and points", () => {
    const { container } = render(<RankScreen migrated open rows={rows.slice(0, 3)} />);
    expect(container.querySelectorAll("img, a, button")).toHaveLength(0);
    expect(container.innerHTML).not.toContain("00000000-0000");
  });

  it("is closed kindly, and waits before its migration", () => {
    const { rerender, container } = render(<RankScreen migrated open={false} rows={[]} />);
    expect(container.textContent).toContain("Peringkat belum dibuka");
    expect(screen.getByRole("link", { name: "Kembali ke Misi" }).getAttribute("href")).toBe(mainWamPath.missions);
    rerender(<RankScreen migrated={false} open rows={[]} />);
    expect(container.textContent).toContain("Misi belum bisa dibuka");
  });

  it("speaks English", () => {
    const { container } = render(<LangProvider lang="en"><RankScreen migrated open rows={rows} /></LangProvider>);
    expect(container.textContent).toContain("You are ranked 7 of 118 participants · 340 points");
    expect(container.textContent).toContain("You");
  });
});

describe("kata lokasi", () => {
  const item = { placeName: "Alun-alun Batu", hasPlace: true, radiusM: 50 };
  const ready = (answer: Partial<{ inside: boolean; reason: "terlalu-jauh" | "tidak-akurat" | "kedaluwarsa" | null }>) => ({
    status: "ready" as const, fix: { latitude: 0, longitude: 0, accuracy: 12, at: "2027-01-05T10:00:00+07:00" }, answer: { inside: true, reason: null, radiusM: 50, accuracyM: 12, hasPlace: true, ...answer },
  });
  const words = (place: Parameters<typeof PlaceBanner>[0]["place"]) => { const { container } = render(<PlaceBanner place={place} item={item} onCheck={() => undefined} />); const text = container.textContent ?? ""; cleanup(); return text; };

  it("says every state in words", () => {
    expect(words({ status: "idle" })).toContain("Lokasi mati");
    expect(words({ status: "reading" })).toContain("Memeriksa lokasi");
    expect(words({ status: "denied" })).toContain("Izin lokasi ditolak");
    expect(words({ status: "unsupported" })).toContain("HP ini tidak bisa membaca lokasi");
    expect(words(ready({}))).toContain("Di Alun-alun Batu · di dalam area misi");
    expect(words(ready({ inside: false, reason: "terlalu-jauh" }))).toContain("Kamu belum di Alun-alun Batu. Dekati sampai radius 50 m.");
    expect(words(ready({ inside: false, reason: "tidak-akurat" }))).toContain("Sinyal lokasi lemah");
    expect(words(ready({ inside: false, reason: "kedaluwarsa" }))).toContain("Lokasi sudah lama");
    expect(words({ status: "failed", message: "Tidak ada sinyal." })).toContain("Tidak ada sinyal.");
  });

  it("offers to turn the location on or to check again, as a button", () => {
    const onCheck = vi.fn();
    render(<PlaceBanner place={{ status: "idle" }} item={item} onCheck={onCheck} />);
    fireEvent.click(screen.getByRole("button", { name: "Aktifkan lokasi" }));
    expect(onCheck).toHaveBeenCalledTimes(1);
  });
});

describe("kamera misi", () => {
  const photo = itemOf("Foto apel Kota Batu");
  const stream = { getTracks: () => [{ stop: () => undefined }] };
  const withCamera = () => vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) }, geolocation: undefined, permissions: undefined });

  it("has no way to pick from the gallery: no file input, no capture, and says so", async () => {
    withCamera();
    const { container } = render(<MissionCamera item={photo} demo />);
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("[capture]")).toBeNull();
    expect(container.textContent).toContain("Foto dari galeri tidak bisa dipakai");
    expect(container.textContent).toContain("Kamera langsung · tanpa galeri");
    expect(await violations()).toEqual([]);
  });

  it("locks the shutter until the server says the person is inside the area", async () => {
    withCamera();
    const { container } = render(<MissionCamera item={photo} />);
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    const shutter = screen.getByRole("button", { name: "Ambil foto" }) as HTMLButtonElement;
    expect(shutter.disabled).toBe(true);
    expect(container.textContent).toContain("Kamera terkunci sampai lokasi aktif");
    expect(container.textContent).toContain("Lokasi mati");
  });

  it("opens the shutter once the (demo) position is inside, and unlocks no gallery", async () => {
    withCamera();
    const { container } = render(<MissionCamera item={photo} demo />);
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    expect((screen.getByRole("button", { name: "Ambil foto" }) as HTMLButtonElement).disabled).toBe(false);
    expect(container.textContent).not.toContain("Kamera terkunci");
    expect(container.textContent).toContain("Di Alun-alun Batu");
  });

  it("says plainly when the camera is refused or missing", async () => {
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new DOMException("no", "NotAllowedError")) }, geolocation: undefined, permissions: undefined });
    const { container } = render(<MissionCamera item={photo} demo />);
    await waitFor(() => expect(container.textContent).toContain("Kamera belum diizinkan"));
    expect(screen.getByRole("button", { name: "Izinkan kamera" })).toBeTruthy();
    cleanup();
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: undefined, geolocation: undefined, permissions: undefined });
    const second = render(<MissionCamera item={photo} demo />);
    await waitFor(() => expect(second.container.textContent).toContain("Kamera tidak tersedia"));
  });
});

describe("check-in misi", () => {
  const checkin = itemOf("Jelajah Taman Kota");
  const geo = (latitude = -7.87, accuracy = 12) => ({ getCurrentPosition: (ok: (position: unknown) => void) => ok({ coords: { latitude, longitude: 112.52, accuracy } }) });
  const answer = (over: object) => ({ inside: true, reason: null, radiusM: 50, accuracyM: 12, hasPlace: true, ...over });
  const json = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => ({ ok: status < 400, data, message: status < 400 ? "Misi selesai." : "Kamu belum berada di area misi." }) });

  it("keeps the button locked until the server says inside, then checks in and says so", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(answer({ inside: false, reason: "terlalu-jauh" })));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("navigator", { ...navigator, geolocation: geo(), permissions: { query: async () => ({ state: "granted", onchange: null }) } });
    render(<MissionCheckIn item={checkin} />);
    await waitFor(() => expect(screen.getByText("Kamu belum di Taman Kota. Dekati sampai radius 50 m.")).toBeTruthy());
    expect((screen.getByRole("button", { name: /Check-in · \+30 poin/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/wam/acara/misi/${checkin.id}/cek`);
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({ kind: "checkin", position: { latitude: -7.87, longitude: 112.52, accuracy: 12, at: expect.any(String) } });

    fetchMock.mockResolvedValueOnce(json(answer({})));
    fireEvent.click(screen.getByRole("button", { name: "Cek lagi" }));
    await waitFor(() => expect((screen.getByRole("button", { name: /Check-in · \+30 poin/ }) as HTMLButtonElement).disabled).toBe(false));

    fetchMock.mockResolvedValueOnce(json({ status: "disetujui" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Check-in · \+30 poin/ })); });
    await waitFor(() => expect(screen.getByText("Check-in berhasil")).toBeTruthy());
    expect(fetchMock.mock.calls.at(-1)![0]).toBe(`/api/wam/acara/misi/${checkin.id}/checkin`);
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Kembali ke Misi" }).getAttribute("href")).toBe(mainWamPath.missions);
  });

  it("shows the server's refusal and checks the position again", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(answer({}))).mockResolvedValueOnce(json(null, 422)).mockResolvedValueOnce(json(answer({ inside: false, reason: "terlalu-jauh" })));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("navigator", { ...navigator, geolocation: geo(), permissions: { query: async () => ({ state: "granted", onchange: null }) } });
    render(<MissionCheckIn item={checkin} />);
    await waitFor(() => expect((screen.getByRole("button", { name: /Check-in/ }) as HTMLButtonElement).disabled).toBe(false));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Check-in/ })); });
    await waitFor(() => expect(screen.getByText("Kamu belum berada di area misi.")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Kamu belum di Taman Kota. Dekati sampai radius 50 m.")).toBeTruthy());
  });

  it("in Mode demo nothing is asked of the server or saved", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<MissionCheckIn item={checkin} demo />);
    fireEvent.click(screen.getByRole("button", { name: /Check-in/ }));
    expect(await screen.findByText(/Contoh: tidak disimpan/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
