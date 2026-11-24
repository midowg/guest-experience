import axe from "axe-core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { LangProvider } from "@/components/main-wam/i18n";
import { ActionsSlotContext } from "@/components/main-wam/shell/ShellSlots";
import { setActiveLang } from "@/lib/main-wam/i18n";
import { missionItems, summarize, type MisiView, type MissionItem } from "@/lib/main-wam/misi/missions";
import { rankPeople } from "@/lib/main-wam/misi/rank";
import { sampleBoard, sampleCompletions, sampleMissionOf, sampleMissions, sampleTaggedIn } from "@/lib/main-wam/misi/sample";
import type { MwMission } from "@/lib/main-wam/misi/types";
import { sampleTagCandidates } from "@/lib/main-wam/misi/tag-sample";
import { mainWamPath } from "@/lib/routes";
import { sampleSessionIds } from "@/lib/main-wam/sample";
import { DEMO_WRITE_MESSAGE } from "@/lib/main-wam/demo";
import { MisiCard } from "./MisiCard";
import { MisiScreen } from "./MisiScreen";
import { MissionCamera } from "./MissionCamera";
import { MissionCheckIn } from "./MissionCheckIn";
import { PlaceBanner } from "./PlaceBanner";
import { RankScreen } from "./RankScreen";

/* Misi as people use it: Beranda's card, the page and its sheet, the Peringkat, the camera and the check-in. */

const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/wam2026/misi" }));
vi.mock("@/components/main-wam/theme/font", () => ({ mainWamFontVars: "" }));
// The camera of a phone is not in jsdom: a shot is three small blobs.
vi.mock("@/components/main-wam/momen/upload/compress", () => ({
  PhotoProblem: class extends Error {},
  grabFrame: async () => ({ source: {}, width: 1200, height: 1500, close: () => undefined }),
  prepareInTurn: <T,>(work: () => Promise<T>) => work(),
  prepareMomenPhoto: async () => ({ besar: new Blob(["b"]), kecil: new Blob(["k"]), ubin: new Blob(["u"]), width: 1200, height: 1500 }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  HTMLMediaElement.prototype.play = () => Promise.resolve();
});
beforeEach(() => { window.history.replaceState(null, "", "/wam2026/misi"); Object.values(router).forEach(fn => fn.mockClear()); });
afterEach(() => { cleanup(); setActiveLang("id"); vi.unstubAllGlobals(); });

const NOW = new Date("2027-01-05T10:00:00+07:00");
const ME = "00000000-0000-4000-8001-000000000001";

function viewOf(completions = sampleCompletions(ME), over: Partial<MisiView> = {}, missions: readonly MwMission[] = sampleMissions): MisiView {
  const items = missionItems(missions, completions, { sessions: [{ id: sampleSessionIds["team-building"], title: "Team building" }], settings: { defaultRadiusM: 50 }, now: NOW });
  return { migrated: true, sample: false, items, summary: summarize(items), points: 340, place: { rank: 7, of: 118 }, leaderboardOpen: true, taggedIn: [], ...over };
}
const itemOf = (title: string): MissionItem => viewOf().items.find(item => item.title === title)!;
const BOD = "Foto bareng KEDUA BOD", PLANK = "Foto plank di Jatim Park", APEL = "Petik apel di kebun apel Batu", SUNRISE = "Sunrise dari hotel", SEKAMAR = "Selfie dengan teman sekamar";
/** The older kinds (a check-in and a session mission) stay readable: Admin may still hold some. */
const legacy: MwMission[] = [
  { id: "00000000-0000-4000-8009-0000000000a1", title: "Jelajah Taman Kota", description: "", kind: "checkin", points: 30, placeName: "Taman Kota", latitude: -7.8742, longitude: 112.5271, radiusM: 50, sessionId: null, credit: "panitia", review: false, opensAt: null, closesAt: null, sort: 1, active: true, rules: [] },
  { id: "00000000-0000-4000-8009-0000000000a2", title: "Bagikan cerita di Team building", description: "", kind: "sesi", points: 50, placeName: "", latitude: null, longitude: null, radiusM: null, sessionId: sampleSessionIds["team-building"], credit: "panitia", review: false, opensAt: null, closesAt: null, sort: 2, active: true, rules: [] },
];
const legacyItem = (title: string) => viewOf([], {}, legacy).items.find(item => item.title === title)!;

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
    // The first mission still open in the admin's order: the BOD photo, turned down once and sendable again.
    expect(card.textContent).toContain("Misi berikutnya · +150");
    expect(card.textContent).toContain(BOD);
    for (const chip of ["Foto langsung", "Lokasi aktif", "Tag 2 BOD", "Wajah jelas", "Maks 3 kali"]) expect(card.textContent).toContain(chip);
    expect(screen.getByRole("img", { name: "2 dari 12 misi selesai" })).toBeTruthy();
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
    expect(screen.getByRole("link").textContent).toContain("Next mission · +150");
    expect(screen.getByRole("link").textContent).toContain("Tag 2 board members");
    expect(screen.getByRole("link").textContent).toContain("Missions");
  });
});

describe("halaman Misi", () => {
  it("shows the points, the place, the ring and the two sections (still to do on top, done below)", async () => {
    const { container } = render(<MisiScreen view={viewOf()} />);
    expect(container.textContent).toContain("Poinmu");
    expect(container.textContent).toContain("340");
    expect(container.textContent).toContain("Peringkat 7 dari 118");
    expect(screen.getByRole("img", { name: "2 dari 12 misi selesai" })).toBeTruthy();
    const todo = screen.getByRole("region", { name: /Belum selesai · 10/ });
    const done = screen.getByRole("region", { name: /Berhasil · 2/ });
    expect(todo.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(todo).getAllByRole("button")).toHaveLength(10);
    expect(within(done).getAllByRole("button")).toHaveLength(2);
    expect(done.textContent).toContain("+80 poin diraih");
    expect(await violations()).toEqual([]);
  });

  it("lists the photo missions with their TNC as chips, on the card, wrapping instead of cutting", () => {
    render(<MisiScreen view={viewOf()} />);
    const cross = screen.getByRole("button", { name: /Foto lintas departemen/ });
    for (const chip of ["Foto langsung", "Lokasi aktif", "Tag 2 lintas departemen", "Wajah jelas", "Maks 3 kali"]) expect(cross.textContent).toContain(chip);
    const plank = screen.getByRole("button", { name: new RegExp(PLANK) });
    for (const chip of ["Di Jatim Park, Batu (contoh)", "Tag teman (opsional)", "Pose plank", "Maks 2 kali"]) expect(plank.textContent).toContain(chip);
    expect(plank.textContent).toMatch(/Batas: /);
    expect(screen.getByRole("button", { name: /Foto kelompok lengkap di Lawn/ }).textContent).toContain("Tag 4 teman");
  });

  it("says each state of a proof in words on its row: waiting to be checked, for panitia's review, turned down", () => {
    render(<MisiScreen view={viewOf()} />);
    expect(screen.getByRole("button", { name: new RegExp(APEL) }).textContent).toContain("Menunggu pemeriksaan");
    expect(screen.getByRole("button", { name: new RegExp(SUNRISE) }).textContent).toContain("Perlu ditinjau panitia");
    expect(screen.getByRole("button", { name: new RegExp(BOD) }).textContent).toContain("Ditolak, kirim ulang");
    expect(within(screen.getByRole("region", { name: /Berhasil/ })).getByRole("button", { name: new RegExp(SEKAMAR) }).textContent).toContain("Selesai");
  });

  it("filters Semua, Belum and Berhasil, with the counts in the words", () => {
    render(<MisiScreen view={viewOf()} />);
    const chips = screen.getByRole("group", { name: "Saring misi" });
    expect(within(chips).getByRole("button", { name: "Semua 12" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(chips).getByRole("button", { name: "Berhasil 2" }));
    expect(screen.queryByRole("region", { name: /Belum selesai/ })).toBeNull();
    expect(screen.getByRole("region", { name: /Berhasil · 2/ })).toBeTruthy();
    fireEvent.click(within(chips).getByRole("button", { name: "Belum 10" }));
    expect(screen.queryByRole("region", { name: /Berhasil/ })).toBeNull();
    expect(screen.getByRole("region", { name: /Belum selesai · 10/ })).toBeTruthy();
  });

  it("orders by points, highest first (the BOD photo), and the other way from the sort sheet", () => {
    render(<MisiScreen view={viewOf()} />);
    const titles = () => within(screen.getByRole("region", { name: /Belum selesai/ })).getAllByRole("button").map(row => row.textContent ?? "");
    expect(titles()[0]).toContain(BOD);
    fireEvent.click(screen.getByRole("button", { name: /Urutkan poin/ }));
    fireEvent.click(screen.getByRole("button", { name: "Terendah dulu" }));
    expect(titles()[0]).toContain("Foto dengan panitia");
    expect(screen.getByRole("button", { name: /Poin, terendah dulu/ })).toBeTruthy();
  });

  it("opens a sheet with the description, the whole TNC and one button (no camera in it)", async () => {
    const { baseElement } = render(<MisiScreen view={viewOf()} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(PLANK) }));
    const sheet = screen.getByRole("dialog");
    expect(sheet.textContent).toContain("+80 poin");
    expect(sheet.textContent).toContain("Plank bersama, di Jatim Park.");
    expect(sheet.textContent).toContain("Syarat dapat poin");
    for (const line of ["Foto langsung dari kamera", "Lokasi aktif dan di area misi", "Berada dalam radius 150 m dari Jatim Park, Batu (contoh) saat memotret.", "Boleh tandai 3 teman", "Pose plank", "Orang di foto dalam posisi plank, seluruh badan terlihat.", "Maksimal 2 kali kirim"]) expect(sheet.textContent).toContain(line);
    expect(sheet.textContent).toMatch(/Berlaku sampai /);
    expect(sheet.textContent).toContain("diperiksa otomatis lalu, bila perlu, ditinjau panitia");
    expect(within(sheet).getByRole("link", { name: "Kerjakan misi" }).getAttribute("href")).toBe(mainWamPath.missionDo(sampleMissionOf("plank-jatim-park").id));
    expect(baseElement.querySelector("video, input[type=file], canvas")).toBeNull();
    // The point of the place never reaches the phone.
    expect(baseElement.innerHTML).not.toContain("-7.8856");
    expect(await violations()).toEqual([]);
  });

  it("lists the tag rule of the BOD mission and lets a rejected photo be sent again (with the reason and the tries)", () => {
    render(<MisiScreen view={viewOf()} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(BOD) }));
    const sheet = screen.getByRole("dialog");
    expect(sheet.textContent).toContain("Tandai 2 anggota BOD");
    expect(sheet.textContent).toContain("Ditolak");
    expect(sheet.textContent).toContain("Alasan: Hanya satu anggota BOD yang ditandai. Tandai keduanya.");
    expect(sheet.textContent).toContain("Percobaan 1 dari 3");
    expect(within(sheet).getByRole("link", { name: "Kirim ulang" }).getAttribute("href")).toBe(mainWamPath.missionDo(sampleMissionOf("bod-berdua").id));
  });

  it("explains a proof being checked, one for panitia's review, an approved one, and a rejection with no tries left", () => {
    render(<MisiScreen view={viewOf()} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(APEL) }));
    let sheet = screen.getByRole("dialog");
    expect(sheet.textContent).toContain("Fotomu sedang diperiksa");
    expect((within(sheet).getByRole("button", { name: "Menunggu pemeriksaan" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    render(<MisiScreen view={viewOf()} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(SUNRISE) }));
    sheet = screen.getByRole("dialog");
    expect(sheet.textContent).toContain("panitia akan melihat fotomu");
    expect((within(sheet).getByRole("button", { name: "Perlu ditinjau panitia" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    render(<MisiScreen view={viewOf()} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(SEKAMAR) }));
    sheet = screen.getByRole("dialog");
    expect(sheet.textContent).toContain("Disetujui +40 poin");
    expect((within(sheet).getByRole("button", { name: "Misi selesai" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    const spent = viewOf([{ ...sampleCompletions(ME)[4], missionId: sampleMissionOf("plank-jatim-park").id, attempts: 2, reviewNote: "Pose bukan plank." }]);
    render(<MisiScreen view={spent} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(PLANK) }));
    sheet = screen.getByRole("dialog");
    expect(sheet.textContent).toContain("Alasan: Pose bukan plank.");
    expect(sheet.textContent).toContain("Batas kirim sudah tercapai");
    expect(within(sheet).queryByRole("link", { name: /Kirim ulang|Kerjakan/ })).toBeNull();
    expect((within(sheet).getByRole("button", { name: "Batas kirim sudah tercapai" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps an older session mission working: it goes to its session", () => {
    const view = viewOf([], {}, legacy);
    render(<MisiScreen view={view} />);
    fireEvent.click(screen.getByRole("button", { name: /Bagikan cerita di Team building/ }));
    expect(within(screen.getByRole("dialog")).getByRole("link", { name: "Kerjakan misi" }).getAttribute("href")).toBe(mainWamPath.session(sampleSessionIds["team-building"]));
    expect(screen.getByRole("dialog").textContent).toContain("Dilakukan di sesi Team building");
  });

  it("lists the photos I was tagged in, and lifts a tag (the sample keeps nothing, a real one asks the server)", async () => {
    const view = viewOf(undefined, { taggedIn: sampleTaggedIn });
    render(<MisiScreen view={{ ...view, sample: true }} />);
    expect(screen.getByRole("region", { name: "Kamu ditandai" }).textContent).toContain("Sari menandaimu di foto misi Selfie dengan teman sekamar");
    fireEvent.click(screen.getByRole("button", { name: "Lepas tag" }));
    expect(screen.queryByRole("button", { name: "Lepas tag" })).toBeNull();
    cleanup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, data: null, message: "Tag dilepas." }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<MisiScreen view={view} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Lepas tag" })); });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Lepas tag" })).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith(`/api/wam/acara/misi/tag/${sampleTaggedIn[0].photoId}`, expect.objectContaining({ method: "DELETE" }));
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

  it("speaks English: chips and TNC", () => {
    setActiveLang("en");
    render(<LangProvider lang="en"><MisiScreen view={viewOf()} /></LangProvider>);
    const plank = screen.getByRole("button", { name: new RegExp(PLANK) });
    for (const chip of ["Live photo", "Location on", "Tag friends (optional)", "Max 2 tries"]) expect(plank.textContent).toContain(chip);
    expect(screen.getByRole("button", { name: new RegExp(APEL) }).textContent).toContain("Waiting to be checked");
    expect(screen.getByRole("button", { name: new RegExp(SUNRISE) }).textContent).toContain("Needs a committee review");
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
    // The rank and the points are bold (prototype), the dictionary marks them with **.
    expect([...container.querySelectorAll("p b")].map(node => node.textContent)).toEqual(["peringkat 7", "340"]);
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
  const photo = itemOf(PLANK);
  const stream = { getTracks: () => [{ stop: () => undefined }] };
  const withCamera = () => vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) }, geolocation: undefined, permissions: undefined });

  it("has no way to pick from the gallery: no file input, no capture, and says so", async () => {
    withCamera();
    const { container } = render(<MissionCamera item={photo} demo />);
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    expect(container.querySelector("input[type=file]")).toBeNull();
    expect(container.querySelector("[capture]")).toBeNull();
    expect(container.textContent).toContain("Foto dari galeri tidak bisa dipakai");
    expect(container.textContent).toContain("Kamera langsung · tanpa galeri");
    expect(container.textContent).toContain("Langkah 1 dari 3: Kamera");
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
    expect(container.textContent).toContain("Di Jatim Park, Batu (contoh)");
  });

  it("says plainly when the camera is refused or missing, and the preview offers a sample photo instead", async () => {
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new DOMException("no", "NotAllowedError")) }, geolocation: undefined, permissions: undefined });
    const { container } = render(<MissionCamera item={photo} demo />);
    await waitFor(() => expect(container.textContent).toContain("Kamera belum diizinkan"));
    expect(screen.getByRole("button", { name: "Izinkan kamera" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pakai foto contoh" })).toBeTruthy();
    cleanup();
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: undefined, geolocation: undefined, permissions: undefined });
    const second = render(<MissionCamera item={photo} demo />);
    await waitFor(() => expect(second.container.textContent).toContain("Kamera tidak tersedia"));
  });
});

describe("langkah Tag dan Ringkasan", () => {
  const bod = itemOf(BOD);
  const candidates = sampleTagCandidates(ME);
  const me = { id: ME, department: "CoE" };
  const camera = (item: MissionItem, props: Partial<Parameters<typeof MissionCamera>[0]> = {}) => render(<MissionCamera item={item} demo candidates={candidates} viewer={me} {...props} />);
  const next = () => fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));

  it("goes camera → Tag → Ringkasan: a sample photo, then the friends, then the checklist", async () => {
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: undefined, geolocation: undefined, permissions: undefined });
    const { container } = camera(bod);
    await waitFor(() => expect(container.textContent).toContain("Kamera tidak tersedia"));
    fireEvent.click(screen.getByRole("button", { name: "Pakai foto contoh" }));
    expect(container.textContent).toContain("Langkah 1 dari 3: Kamera");
    next();
    expect(container.textContent).toContain("Langkah 2 dari 3: Tag");
    expect(container.textContent).toContain("Tandai temanmu");
    expect(container.textContent).toContain("Pilih 2 anggota BOD");
    expect(container.textContent).toContain("0 dari 2 dipilih");
    // Not enough yet: the way on is closed.
    expect((screen.getByRole("button", { name: "Lanjut" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Pilih Arman" }));
    expect((screen.getByRole("button", { name: "Lanjut" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Pilih Wulan" }));
    expect(container.textContent).toContain("2 dari 2 dipilih");
    next();
    expect(container.textContent).toContain("Langkah 3 dari 3: Ringkasan");
    expect(container.textContent).toContain("Periksa sebelum kirim");
    expect(container.textContent).toContain("Ditandai: Arman, Wulan");
    expect(await violations()).toEqual([]);
  });

  it("suggests BOD first for a BOD mission, with the reason in words; and the room and the train seat for theirs", () => {
    const { container, unmount } = camera(bod, { demoStart: "tag" });
    const suggested = within(screen.getByRole("region", { name: "Saran untukmu" }));
    expect(suggested.getAllByRole("button").map(button => button.textContent)).toEqual([expect.stringContaining("Arman"), expect.stringContaining("Wulan")]);
    expect(container.textContent).toContain("BOD");
    unmount();
    camera(itemOf(SEKAMAR), { demoStart: "tag" });
    expect(within(screen.getByRole("region", { name: "Saran untukmu" })).getAllByRole("button").map(button => button.textContent)).toEqual([expect.stringContaining("Dewi"), expect.stringContaining("Sari")]);
    expect(screen.getByRole("region", { name: "Saran untukmu" }).textContent).toContain("Sekamar");
    cleanup();
    camera(itemOf("Selfie dengan teman sebangku di kereta"), { demoStart: "tag" });
    expect(screen.getByRole("region", { name: "Saran untukmu" }).textContent).toContain("Bima");
    expect(screen.getByRole("region", { name: "Saran untukmu" }).textContent).toContain("Sebangku di kereta");
  });

  it("searches by name, removes a pick from its chip, and stops at the number the rule allows", () => {
    camera(bod, { demoStart: "tag", demoTagged: [candidates.find(person => person.name === "Arman")!.id] });
    fireEvent.change(screen.getByLabelText("Cari nama peserta"), { target: { value: "dew" } });
    expect(within(screen.getByRole("region", { name: "Semua peserta" })).getAllByRole("button").map(button => button.textContent)).toEqual([expect.stringContaining("Dewi")]);
    fireEvent.change(screen.getByLabelText("Cari nama peserta"), { target: { value: "zzz" } });
    expect(screen.getByText("Tidak ada nama yang cocok.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Cari nama peserta"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Pilih Wulan" }));
    expect(screen.getByText(/Sudah 2 orang/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Pilih Dewi" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Hapus Arman" }));
    expect(screen.getByText("1 dari 2 dipilih")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Pilih Dewi" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("the checklist says which rules are met, which are not, and which the checker judges; Kirim waits for the unmet", () => {
    const { container, unmount } = camera(bod, { demoStart: "ringkas" });
    const rows = () => [...container.querySelectorAll("li[data-state]")].map((row): [string, string] => [row.getAttribute("data-state") ?? "", row.textContent ?? ""]);
    expect(rows().find(([, text]) => text.includes("Tandai 2 anggota BOD"))).toEqual(["no", expect.stringContaining("Belum terpenuhi")]);
    expect(rows().find(([, text]) => text.includes("Wajah jelas"))).toEqual(["judged", expect.stringContaining("Dinilai pemeriksa")]);
    expect(rows().find(([, text]) => text.includes("Foto langsung dari kamera"))?.[0]).toBe("ok");
    expect(container.textContent).toContain("Tandai 2 anggota BOD (baru 0).");
    expect((screen.getByRole("button", { name: /Kirim · \+150 poin/ }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    const ready = camera(bod, { demoStart: "ringkas", demoTagged: candidates.filter(person => person.bod).map(person => person.id) });
    expect(ready.container.querySelectorAll("li[data-state='no']")).toHaveLength(0);
    expect((screen.getByRole("button", { name: /Kirim · \+150 poin/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("a person who is not a BOD fails the BOD rule, in words", () => {
    const wrong = candidates.filter(person => person.bod).slice(0, 1).concat(candidates.filter(person => !person.bod).slice(0, 1)).map(person => person.id);
    const { container } = camera(bod, { demoStart: "ringkas", demoTagged: wrong });
    expect(container.textContent).toContain("Orang yang ditandai harus anggota BOD.");
    expect((screen.getByRole("button", { name: /Kirim/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("goes straight from the camera to the checklist when the mission has no tag, and says the place is not met when it is not", () => {
    const apel = itemOf(APEL);
    const { container } = camera(apel, { demoStart: "ringkas" });
    expect(container.textContent).toContain("Langkah 2 dari 2: Ringkasan");
    expect(container.textContent).not.toContain("Tandai temanmu");
    expect(container.textContent).toContain("Kamu berada di lokasi misi");
  });

  it("in Mode demo Kirim saves nothing and says so", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    camera(bod, { demoStart: "ringkas", demoTagged: candidates.filter(person => person.bod).map(person => person.id) });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Kirim/ })); });
    expect(await screen.findByText(DEMO_WRITE_MESSAGE)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("mengirim bukti", () => {
  const apel = itemOf(APEL);
  const geo = { getCurrentPosition: (ok: (position: unknown) => void) => ok({ coords: { latitude: -7.8845, longitude: 112.5175, accuracy: 12 } }) };
  const json = (data: unknown, status = 200, message = "") => ({ ok: status < 400, status, json: async () => ({ ok: status < 400, data, message }) });
  const stream = { getTracks: () => [{ stop: () => undefined }] };

  function setup(confirm: unknown) {
    const calls: { url: string; init?: { method?: string; body?: string } }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      calls.push({ url, init });
      if (url.endsWith("/cek")) return json({ inside: true, reason: null, radiusM: 200, accuracyM: 12, hasPlace: true });
      if (url.endsWith("/foto/unggah")) return json({ token: `1767000000.${"a".repeat(64)}`, uploads: { besar: "https://storage.test/b", kecil: "https://storage.test/k", ubin: "https://storage.test/u" } });
      if (url.startsWith("https://storage.test/")) return { ok: true, status: 200, json: async () => ({}) };
      return confirm;
    }));
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) }, geolocation: geo, permissions: { query: async () => ({ state: "granted", onchange: null }) } });
    URL.createObjectURL = () => "blob:foto";
    URL.revokeObjectURL = () => undefined;
    return calls;
  }
  async function sendIt() {
    const { container } = render(<MissionCamera item={apel} candidates={[]} viewer={{ id: ME, department: "CoE" }} />);
    await waitFor(() => expect((screen.getByRole("button", { name: "Ambil foto" }) as HTMLButtonElement).disabled).toBe(false));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Ambil foto" })); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Lanjut" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    expect(container.textContent).toContain("Langkah 2 dari 2: Ringkasan");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Kirim · \+50 poin/ })); });
    return container;
  }

  it("sends the three files and the tags, then says the photo waits for panitia", async () => {
    const calls = setup(json({ status: "perlu_ditinjau", reasons: [] }, 200, "Foto terkirim. Panitia akan meninjau."));
    const container = await sendIt();
    await waitFor(() => expect(container.textContent).toContain("Panitia akan meninjau fotomu"));
    expect(container.textContent).toContain("Foto terkirim");
    const start = calls.find(call => call.url.endsWith("/foto/unggah"))!;
    expect(JSON.parse(start.init!.body!)).toMatchObject({ size: 1, thumbSize: 1, tileSize: 1, width: 1200, height: 1500, tags: [], position: { accuracy: 12 } });
    expect(calls.filter(call => call.url.startsWith("https://storage.test/")).map(call => call.url).sort()).toEqual(["https://storage.test/b", "https://storage.test/k", "https://storage.test/u"]);
    const confirm = calls.find(call => call.url.endsWith("/foto/simpan"))!;
    expect(JSON.parse(confirm.init!.body!)).toMatchObject({ token: expect.stringMatching(/^\d+\.[0-9a-f]{64}$/), tags: [], tileSize: 1 });
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Kembali ke Misi" }).getAttribute("href")).toBe(mainWamPath.missions);
  });

  it("says the points came in when the proof was approved at once", async () => {
    setup(json({ status: "disetujui", reasons: [] }));
    const container = await sendIt();
    await waitFor(() => expect(container.textContent).toContain("Misi selesai"));
    expect(container.textContent).toContain("+50 poin masuk");
  });

  it("says why when the rules rejected it", async () => {
    setup(json({ status: "ditolak", reasons: ["Batas kirim 3 kali sudah tercapai."] }));
    const container = await sendIt();
    await waitFor(() => expect(container.textContent).toContain("Foto belum memenuhi syarat"));
    expect(container.textContent).toContain("Batas kirim 3 kali sudah tercapai.");
  });

  it("stays on the summary with the server's refusal, so the person can fix it and send again", async () => {
    setup(json(null, 422, "Kamu belum berada di area misi."));
    const container = await sendIt();
    await waitFor(() => expect(container.textContent).toContain("Kamu belum berada di area misi."));
    expect(container.textContent).toContain("Periksa sebelum kirim");
    expect((screen.getByRole("button", { name: /Kirim · \+50 poin/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("check-in misi (an older kind, still working)", () => {
  const checkin = legacyItem("Jelajah Taman Kota");
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
