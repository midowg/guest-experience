import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { clearResources } from "@/components/app-shell/resource";
import { WellbeingApiError, type WellbeingApi } from "./api";
import { mockApi, sampleMe } from "./mock-api";
import { sectionOf, WellbeingApp } from "./WellbeingApp";
import { STRAVA_OPEN } from "./StravaSheet";

// usePathname follows the address, as Next does after history.pushState / replaceState.
const route = vi.hoisted(() => ({ listeners: new Set<() => void>() }));
vi.mock("next/navigation", async () => {
  const React = await import("react");
  return {
    usePathname: () => React.useSyncExternalStore(listener => { route.listeners.add(listener); return () => { route.listeners.delete(listener); }; }, () => window.location.pathname),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  };
});

// next/font only runs inside Next's compiler.
vi.mock("./font", () => ({ fontVars: "" }));
// Tesseract (WebAssembly) does not run in jsdom: the text a photo "has" is set per test.
const ocr = vi.hoisted(() => ({ text: "", fail: false }));
vi.mock("./ocr", () => ({ readPhotoText: async () => { if (ocr.fail) throw new Error("offline"); return ocr.text; } }));
// jsdom has no canvas: the card is "drawn" as a tiny picture (Foto profil, 18 Nov 2026).
vi.mock("@/components/pra-wam/questionnaire/cardArt", () => ({
  drawAvatar: async () => ({ toBlob: (done: (blob: Blob) => void, type: string) => done(new Blob(["kartu"], { type })) }),
  blobOf: (canvas: { toBlob: (done: (blob: Blob | null) => void, type: string) => void }, type: string) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type)),
}));

beforeAll(() => {
  // jsdom has no modal dialogs, observers, object URLs or media queries; enough of each for the app.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } } as unknown as typeof IntersectionObserver;
  URL.createObjectURL = () => "blob:preview";
  URL.revokeObjectURL = () => {};
  window.matchMedia = (query: string) => ({ matches: query.includes("reduce"), media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
  const notify = () => route.listeners.forEach(listener => listener());
  const push = window.history.pushState.bind(window.history);
  const replace = window.history.replaceState.bind(window.history);
  window.history.pushState = (...args: Parameters<History["pushState"]>) => { push(...args); notify(); };
  window.history.replaceState = (...args: Parameters<History["replaceState"]>) => { replace(...args); notify(); };
  window.addEventListener("popstate", notify);
});
beforeEach(() => { window.history.replaceState(null, "", "/wlm"); ocr.text = ""; ocr.fail = false; });
afterEach(() => { cleanup(); clearResources("wbapp:"); window.localStorage.clear(); });

const fast = () => mockApi({ latency: [0, 0] });
const app = (api: WellbeingApi = fast()) => render(<WellbeingApp me={sampleMe} api={api} />);
const totalShown = () => screen.getByText("Total poin").nextElementSibling?.textContent ?? "";
const dialog = () => screen.getByRole("dialog");
const photo = (name = "bukti.png") => new File(["foto"], name, { type: "image/png" });
const addPhoto = (file = photo()) => fireEvent.change(screen.getByTestId("catat-file"), { target: { files: [file] } });

async function openDaily(dimension: string, type: string) {
  fireEvent.click(screen.getByRole("button", { name: "Catat" }));
  fireEvent.click(await within(dialog()).findByText("Kegiatan harian"));
  fireEvent.click(await within(dialog()).findByText(dimension));
  fireEvent.click(await within(dialog()).findByText(type));
}

describe("sectionOf", () => {
  it("reads the tab from the address, Beranda by default", () => {
    expect(sectionOf("/wlm")).toBe("beranda");
    expect(sectionOf("/wlm/peringkat")).toBe("peringkat");
    expect(sectionOf("/wlm/apa")).toBe("beranda");
    expect(sectionOf("/dev-preview/wellbeing/profil", "/dev-preview/wellbeing")).toBe("profil");
  });
});

describe("WellbeingApp", () => {
  it("moves between tabs without a page load, keeping the frame and the tab it left", async () => {
    app();
    await screen.findByText("Total poin");
    const menu = screen.getByRole("navigation", { name: "Menu utama" });
    expect(within(menu).getByRole("link", { name: "Beranda" }).getAttribute("aria-current")).toBe("page");

    fireEvent.click(within(menu).getByRole("link", { name: "Riwayat" }));
    expect(window.location.pathname).toBe("/wlm/riwayat");
    await screen.findByRole("group", { name: "Jenis riwayat" });
    expect(within(menu).getByRole("link", { name: "Riwayat" }).getAttribute("aria-current")).toBe("page");
    // Beranda stays mounted (its data and scroll kept), only hidden.
    expect(document.querySelector('section[aria-label="Beranda"]')?.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector('section[aria-label="Beranda"]')?.textContent).toContain("Total poin");
    expect(screen.getByRole("region", { name: "Riwayat" })).toBeTruthy();
  });

  it("keeps Beranda under the tabs: tab to tab replaces, Back returns to Beranda", async () => {
    app();
    await screen.findByText("Total poin");
    const menu = screen.getByRole("navigation", { name: "Menu utama" });
    const before = window.history.length;
    fireEvent.click(within(menu).getByRole("link", { name: "Riwayat" }));
    fireEvent.click(within(menu).getByRole("link", { name: "Peringkat" }));
    fireEvent.click(within(menu).getByRole("link", { name: "Profil" }));
    expect(window.location.pathname).toBe("/wlm/profil");
    expect(window.history.length).toBe(before + 1);
    await screen.findByText("Rekor");

    act(() => { window.history.back(); });
    await waitFor(() => expect(window.location.pathname).toBe("/wlm"));
    expect(within(menu).getByRole("link", { name: "Beranda" }).getAttribute("aria-current")).toBe("page");
  });

  it("asks for a proof photo before saving", async () => {
    app();
    await screen.findByText("Total poin");
    await openDaily("Emosional", "Sharing Session");
    fireEvent.click(await within(dialog()).findByRole("button", { name: /^Simpan/ }));
    expect(await within(dialog()).findByText("Tambahkan minimal 1 foto bukti.")).toBeTruthy();
  });

  it("asks for the sport when Olahraga is saved without one", async () => {
    app();
    await screen.findByText("Total poin");
    fireEvent.click(screen.getByRole("button", { name: "Catat" }));
    fireEvent.click(await within(dialog()).findByRole("button", { name: /^Olahraga/ }));
    fireEvent.click(await within(dialog()).findByRole("button", { name: /^Simpan/ }));
    expect(await within(dialog()).findByText("Pilih jenis olahraga.")).toBeTruthy();
  });

  it("refuses a day already logged before any upload, and hints it in the list", async () => {
    const base = fast();
    const startUpload = vi.fn<WellbeingApi["startUpload"]>((input, options) => base.startUpload(input, options));
    app({ ...base, startUpload });
    await screen.findByText("Total poin");
    fireEvent.click(screen.getByRole("button", { name: "Catat" }));
    fireEvent.click(await within(dialog()).findByText("Kegiatan harian"));
    fireEvent.click(await within(dialog()).findByText("Emosional"));
    // The sample has Meditasi today: still selectable, with a quiet hint.
    const row = (await within(dialog()).findByText("Meditasi")).closest("button")!;
    expect(row.hasAttribute("disabled")).toBe(false);
    expect(within(row).getByText("Sudah dicatat hari ini")).toBeTruthy();
    fireEvent.click(row);
    expect(await within(dialog()).findByText("Sudah kamu catat pada tanggal ini. Pilih tanggal lain.")).toBeTruthy();
    addPhoto();
    fireEvent.click(within(dialog()).getByRole("button", { name: /^Simpan/ }));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(startUpload).not.toHaveBeenCalled();
  });

  it("saves with a photo and Beranda shows the new total at once", async () => {
    app();
    await screen.findByText("Total poin");
    const before = Number(totalShown().replace(/\./g, ""));
    await openDaily("Emosional", "Sharing Session");
    addPhoto();
    expect(await within(dialog()).findByAltText("Foto bukti 1")).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Simpan · +80 poin" }));

    expect(await within(dialog()).findByText("+80 poin", {}, { timeout: 3000 })).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Selesai" }));
    await waitFor(() => expect(Number(totalShown().replace(/\./g, ""))).toBe(before + 80));
    expect(screen.getAllByText("Sharing Session").length).toBeGreaterThan(0);
  });

  it("uploads the photos again after the server refuses the save", async () => {
    const base = fast();
    const startUpload = vi.fn<WellbeingApi["startUpload"]>((input, options) => base.startUpload(input, options));
    const log = vi.fn<WellbeingApi["log"]>()
      .mockRejectedValueOnce(new WellbeingApiError("Unggahan tidak dikenali. Unggah ulang fotonya.", 422, { photos: ["Unggahan tidak dikenali."] }))
      .mockImplementation((input, options) => base.log(input, options));
    app({ ...base, startUpload, log });
    await screen.findByText("Total poin");
    await openDaily("Emosional", "Sharing Session");
    addPhoto();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Simpan · +80 poin" }));
    expect(await within(dialog()).findByText("Unggahan tidak dikenali. Unggah ulang fotonya.", {}, { timeout: 3000 })).toBeTruthy();
    expect(startUpload).toHaveBeenCalledTimes(1);

    fireEvent.click(within(dialog()).getByRole("button", { name: "Simpan · +80 poin" }));
    expect(await within(dialog()).findByText("+80 poin", {}, { timeout: 3000 })).toBeTruthy();
    expect(startUpload).toHaveBeenCalledTimes(2);
  });

  it("keeps the Catat draft when the sheet is closed by accident", async () => {
    app();
    await screen.findByText("Total poin");
    await openDaily("Emosional", "Sharing Session");
    fireEvent.change(within(dialog()).getByLabelText(/Catatan/), { target: { value: "Diskusi tim kreatif" } });
    addPhoto();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Tutup" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Catat" }));
    expect((await within(dialog()).findByLabelText(/Catatan/) as HTMLTextAreaElement).value).toBe("Diskusi tim kreatif");
    expect(within(dialog()).getByAltText("Foto bukti 1")).toBeTruthy();
    expect(within(dialog()).getByText("Sharing Session")).toBeTruthy();
  });

  it("offers Tetap simpan when Strava already has the same sport that day", async () => {
    const base = fast();
    const log = vi.fn<WellbeingApi["log"]>()
      .mockRejectedValueOnce(new WellbeingApiError("Sudah ada \"Lari pagi\" dari Strava di tanggal ini.", 409, { code: ["strava_twin"] }))
      .mockImplementation((input, options) => base.log(input, options));
    app({ ...base, log });
    await screen.findByText("Total poin");
    fireEvent.click(screen.getByRole("button", { name: "Catat" }));
    fireEvent.click(await within(dialog()).findByRole("button", { name: /^Olahraga/ }));
    fireEvent.click(await within(dialog()).findByRole("button", { name: "Running" }));
    fireEvent.change(within(dialog()).getByLabelText("Kalori"), { target: { value: "300" } });
    addPhoto(photo("jam.png"));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Simpan · +300 poin" }));
    fireEvent.click(await within(dialog()).findByRole("button", { name: "Tetap simpan" }, { timeout: 3000 }));
    expect(await within(dialog()).findByText("+300 poin", {}, { timeout: 3000 })).toBeTruthy();
    expect(log.mock.lastCall?.[0]).toEqual(expect.objectContaining({ code: "sport.running", kcal: 300, force: true }));
  });

  it("shows the month as a race: my place, the one to catch, and who is around me (18 Nov 2026)", async () => {
    app();
    const race = await screen.findByRole("region", { name: /^Balapan / });
    // The place reads "Peringkat #16" (the word for screen readers only).
    expect(race.querySelector("p")?.textContent).toMatch(/^Peringkat #\d+$/);
    expect(within(race).getByText(/^dari \d+ karyawan/)).toBeTruthy();
    expect(within(race).getByText(/Sisa \d+ hari|Hari terakhir/)).toBeTruthy();
    expect(await within(race).findByText(/^Kejar/)).toBeTruthy();
    expect(within(race).getByText("poin lagi")).toBeTruthy();
    const around = await screen.findByRole("region", { name: "Di sekitarmu" });
    const rows = within(around).getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rows.filter(row => row.getAttribute("aria-current") === "true")).toHaveLength(1);
  });

  it("invites a new person into the race instead of showing a place", async () => {
    app(mockApi({ latency: [0, 0], empty: true }));
    const race = await screen.findByRole("region", { name: /^Balapan / });
    expect(within(race).getByText("Belum masuk peringkat")).toBeTruthy();
    expect(within(race).getByRole("button", { name: "Catat aktivitas" })).toBeTruthy();
    expect(await screen.findByRole("region", { name: "Teratas bulan ini" })).toBeTruthy();
  });

  it("shows Peringkat as a race: the podium, my place, the chasers, and the rest under Lihat semua (18 Nov 2026)", async () => {
    window.history.replaceState(null, "", "/wlm/peringkat");
    app();
    // The top three in rank order (the grid puts #1 in the middle), #1 with its lead.
    const podium = await screen.findByRole("list", { name: "Tiga teratas" });
    const top = within(podium).getAllByRole("listitem");
    expect(top.map(item => /Peringkat (\d+):/.exec(item.textContent ?? "")?.[1])).toEqual(["1", "2", "3"]);
    expect(within(top[0]).getByText(/^Unggul [\d.]+$/)).toBeTruthy();
    // My place: the one to catch, and how far the podium is (the sample person is past #8).
    const standing = screen.getByRole("region", { name: "Posisimu bulan ini" });
    expect(within(standing).getByText(/^Kejar/)).toBeTruthy();
    expect(within(standing).getByText("lagi ke podium", { exact: false })).toBeTruthy();
    // #4 to #8, then the one above me, me and the one below; not the whole list.
    const chasers = screen.getByRole("region", { name: "Mengejar podium" });
    const rows = within(chasers).getAllByRole("listitem");
    const ranks = rows.map(row => Number(/^Peringkat (\d+)/.exec(row.textContent ?? "")?.[1]));
    expect(ranks.slice(0, 5)).toEqual([4, 5, 6, 7, 8]);
    expect(rows).toHaveLength(8);
    const mine = rows.find(row => row.getAttribute("aria-current") === "true")!;
    expect(ranks[rows.indexOf(mine) - 1]).toBe(ranks[rows.indexOf(mine)] - 1);

    fireEvent.click(within(chasers).getByRole("button", { name: "Lihat semua peringkat" }));
    const sheet = await screen.findByRole("dialog");
    const count = Number(/· (\d+) karyawan berpoin/.exec(sheet.textContent ?? "")?.[1]);
    expect(count).toBeGreaterThan(rows.length + 3);
    expect(within(sheet).getAllByRole("listitem")).toHaveLength(count);
    // My row stays under the list.
    expect(within(sheet).getByRole("button", { name: /^Posisimu: peringkat \d+, [\d.]+ poin, [\d.]+ poin lagi ke #\d+\. Tampilkan di daftar$/ })).toBeTruthy();
  });

  it("invites me onto Peringkat when I have no points yet", async () => {
    window.history.replaceState(null, "", "/wlm/peringkat");
    app(mockApi({ latency: [0, 0], empty: true }));
    const standing = await screen.findByRole("region", { name: "Posisimu bulan ini" });
    expect(within(standing).getByText("Belum masuk peringkat")).toBeTruthy();
    fireEvent.click(within(standing).getByRole("button", { name: "Catat aktivitas" }));
    expect(await within(dialog()).findByText("Kegiatan harian")).toBeTruthy();
  });

  it("burns the streak flame once today is logged, an outline until then, and lights it on the first save of the day (18 Nov 2026)", async () => {
    const { unmount } = app();
    const lit = (await screen.findByText("hari beruntun", { exact: false })).closest("div")!;
    expect(lit.getAttribute("data-lit")).toBe("true");
    expect(within(lit).getByText("Hari ini sudah tercatat. Lanjutkan besok.")).toBeTruthy();
    expect(within(lit).queryByRole("button", { name: "Catat sekarang" })).toBeNull();
    unmount(); clearResources("wbapp:");

    app(mockApi({ latency: [0, 0], notToday: true }));
    const off = (await screen.findByText("hari beruntun", { exact: false })).closest("div")!;
    expect(off.getAttribute("data-lit")).toBe("false");
    expect(within(off).getByText("Belum tercatat hari ini.")).toBeTruthy();
    const streak = Number(within(off).getByText(/^\d+$/).textContent);
    fireEvent.click(within(off).getByRole("button", { name: "Catat sekarang" }));
    fireEvent.click(await within(dialog()).findByText("Kegiatan harian"));
    fireEvent.click(await within(dialog()).findByText("Emosional"));
    fireEvent.click(await within(dialog()).findByText("Sharing Session"));
    addPhoto();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Simpan · +80 poin" }));
    const done = await within(dialog()).findByText("hari beruntun · api hari ini menyala", { exact: false }, { timeout: 3000 });
    expect(done.closest("p")?.textContent).toBe(`${streak + 1} hari beruntun · api hari ini menyala`);
    fireEvent.click(within(dialog()).getByRole("button", { name: "Selesai" }));
    await waitFor(() => expect(screen.getByText("Hari ini sudah tercatat. Lanjutkan besok.")).toBeTruthy());
  });

  it("trades the saldo for a reward: the saldo card, a claim held from the saldo, and Batalkan while it waits (18 Nov 2026)", async () => {
    app();
    const card = await screen.findByRole("button", { name: /^Saldo poin [\d.]+\. .+\. Buka Hadiah$/ }, { timeout: 3000 });
    const before = Number(/^Saldo poin ([\d.]+)/.exec(card.getAttribute("aria-label") ?? "")![1].replace(/\./g, ""));
    fireEvent.click(card);
    const grid = await within(dialog()).findByRole("list", { name: "Daftar hadiah" });
    // Short of points: how many more; enough: Bisa diklaim.
    expect(within(grid).getByRole("button", { name: /^Jam olahraga Garmin, 300\.000 poin, Kurang [\d.]+ poin$/ })).toBeTruthy();
    fireEvent.click(within(grid).getByRole("button", { name: "Kelas yoga satu bulan, 15.000 poin, Bisa diklaim" }));
    fireEvent.change(await within(dialog()).findByLabelText(/Catatan untuk admin/), { target: { value: "Jadwal Sabtu pagi" } });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Ajukan klaim · 15.000 poin" }));
    expect(await within(dialog()).findByText("Permintaan terkirim", {}, { timeout: 3000 })).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Lihat klaim saya" }));
    // The points are held: the saldo is 15.000 less; Klaim saya has it waiting, with my note.
    expect(within(dialog()).getByRole("region", { name: "Saldo poin" }).textContent).toContain((before - 15000).toLocaleString("id-ID"));
    const mine = within(within(dialog()).getByRole("list", { name: "Klaim saya" })).getAllByRole("listitem")[0];
    expect(within(mine).getByText("Diajukan")).toBeTruthy();
    expect(within(mine).getByText("Catatanmu: Jadwal Sabtu pagi")).toBeTruthy();
    fireEvent.click(within(mine).getByRole("button", { name: "Batalkan" }));
    fireEvent.click(within(mine).getByRole("button", { name: "Ya, batalkan" }));
    expect(await within(mine).findByText("Dibatalkan", {}, { timeout: 3000 })).toBeTruthy();
    expect(within(dialog()).getByRole("region", { name: "Saldo poin" }).textContent).toContain(before.toLocaleString("id-ID"));
  });

  it("says where the save leaves me in the race", async () => {
    app(mockApi({ latency: [0, 0], empty: true }));
    await screen.findByText("Total poin");
    await openDaily("Emosional", "Sharing Session");
    addPhoto();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Simpan · +80 poin" }));
    expect(await within(dialog()).findByText(/^Masuk peringkat: #\d+ bulan ini$/, {}, { timeout: 3000 })).toBeTruthy();
  });

  it("logs from a photo on one review screen: everything read is filled and marked, to correct and save (17 Nov 2026)", async () => {
    ocr.text = "Morning Run\nHari ini at 6:05 AM\nMoving Time\n28:01\nCalories\n412Cal";
    app();
    await screen.findByText("Total poin");
    fireEvent.click(screen.getByRole("button", { name: "Catat" }));
    fireEvent.click(await within(dialog()).findByRole("button", { name: /^Dari foto bukti/ }));
    addPhoto(photo("strava.png"));
    expect(await within(dialog()).findByText(/Running · 412 kkal · 28 menit/, {}, { timeout: 3000 })).toBeTruthy();
    expect(within(dialog()).getByRole("heading", { name: "Periksa hasil foto" })).toBeTruthy();
    expect((within(dialog()).getByLabelText("Kegiatan") as HTMLSelectElement).value).toBe("sport.running");
    expect((within(dialog()).getByLabelText(/^Jam/) as HTMLInputElement).value).toBe("06:05");
    expect((within(dialog()).getByLabelText(/^Durasi/) as HTMLInputElement).value).toBe("28");
    expect((within(dialog()).getByLabelText(/^Catatan/) as HTMLTextAreaElement).value).toBe("Morning Run");
    const kcal = within(dialog()).getByLabelText("Kalori") as HTMLInputElement;
    expect(kcal.value).toBe("412");
    expect(kcal.dataset.auto).toBe("true");
    // The photo read is already the proof.
    expect(within(dialog()).getByAltText("Foto bukti 1")).toBeTruthy();
    // Corrected by hand: no longer marked as read.
    fireEvent.change(kcal, { target: { value: "400" } });
    expect(kcal.dataset.auto).toBeUndefined();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Simpan · +400 poin" }));
    expect(await within(dialog()).findByText("+400 poin", {}, { timeout: 3000 })).toBeTruthy();
  });

  it("reads steps from a photo into Langkah harian, and keeps the photo when nothing is read", async () => {
    ocr.text = "Hari ini\n9.128 / 10.000 langkah";
    app();
    await screen.findByText("Total poin");
    fireEvent.click(screen.getByRole("button", { name: "Catat" }));
    fireEvent.click(await within(dialog()).findByRole("button", { name: /^Dari foto bukti/ }));
    addPhoto();
    expect((await within(dialog()).findByLabelText("Jumlah langkah", {}, { timeout: 3000 }) as HTMLInputElement).value).toBe("9128");
    expect((within(dialog()).getByLabelText("Kegiatan") as HTMLSelectElement).value).toBe("physical.steps");
    // Another kind is one choice away, on the same screen.
    fireEvent.change(within(dialog()).getByLabelText("Kegiatan"), { target: { value: "sport.walking" } });
    expect(within(dialog()).getByLabelText("Kalori")).toBeTruthy();

    cleanup(); clearResources("wbapp:");
    ocr.text = "Foto bersama tim";
    app();
    await screen.findByText("Total poin");
    fireEvent.click(screen.getByRole("button", { name: "Catat" }));
    fireEvent.click(await within(dialog()).findByRole("button", { name: /^Dari foto bukti/ }));
    addPhoto();
    expect(await within(dialog()).findByText(/Tidak ada data yang terbaca dari foto/, {}, { timeout: 3000 })).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole("button", { name: /^Olahraga/ }));
    expect(await within(dialog()).findByAltText("Foto bukti 1")).toBeTruthy();
  });

  it("reads a photo added in the form, filling only what is still empty", async () => {
    ocr.text = "Badminton\n2 jam\n640 kkal";
    app();
    await screen.findByText("Total poin");
    fireEvent.click(screen.getByRole("button", { name: "Catat" }));
    fireEvent.click(await within(dialog()).findByRole("button", { name: /^Olahraga/ }));
    fireEvent.click(await within(dialog()).findByRole("button", { name: "Running" }));
    fireEvent.change(within(dialog()).getByLabelText(/^Durasi/), { target: { value: "45" } });
    addPhoto(photo("jam.png"));
    await waitFor(() => expect((within(dialog()).getByLabelText("Kalori") as HTMLInputElement).value).toBe("640"));
    // The sport chosen and the duration typed stay as they were.
    expect(within(dialog()).getByRole("button", { name: "Running" }).getAttribute("aria-pressed")).toBe("true");
    expect((within(dialog()).getByLabelText(/^Durasi/) as HTMLInputElement).value).toBe("45");
  });

  it("picks the theme in a sheet from a settings row, as phones do", async () => {
    window.history.replaceState(null, "", "/wlm/profil");
    const { container } = app();
    fireEvent.click(await screen.findByRole("button", { name: /^Tema: Otomatis/ }));
    fireEvent.click(await within(dialog()).findByRole("radio", { name: /^Gelap/ }));
    await waitFor(() => expect(container.firstElementChild?.getAttribute("data-theme")).toBe("dark"));
    expect(screen.getByRole("button", { name: /^Tema: Gelap/ })).toBeTruthy();
    // History lives in Riwayat only.
    expect(screen.queryByText("Riwayat poin")).toBeNull();
    expect(screen.queryByText("Riwayat aktivitas")).toBeNull();
  });

  it("makes the WAM character card the profile photo: preview first, then shown at once (18 Nov 2026)", async () => {
    window.history.replaceState(null, "", "/wlm/profil");
    const saved: string[] = [];
    const api = fast();
    const savePhoto = api.savePhoto;
    api.savePhoto = async (blob, mime, onProgress) => { saved.push(mime); return savePhoto(blob, mime, onProgress); };
    app(api);
    fireEvent.click(await screen.findByRole("button", { name: "Tambah foto profil" }));
    // The card is drawn into a round photo and offered with its figure and rarity.
    fireEvent.click(await within(dialog()).findByRole("button", { name: "Pakai kartu tokoh WAM: Ada Lovelace, Rare" }));
    expect(await within(dialog()).findByRole("img", { name: "Pratinjau foto profil" })).toBeTruthy();
    expect(saved).toEqual([]);
    fireEvent.click(within(dialog()).getByRole("button", { name: "Pakai foto ini" }));
    expect(await screen.findByText("Foto profilmu sekarang kartu tokohmu.")).toBeTruthy();
    expect(saved).toHaveLength(1);
    // Saved: the button now changes the photo, and Hapus foto is offered.
    fireEvent.click(await screen.findByRole("button", { name: "Ganti foto profil" }));
    fireEvent.click(await within(dialog()).findByRole("button", { name: "Hapus foto" }));
    fireEvent.click(within(dialog()).getAllByRole("button", { name: "Hapus foto" }).at(-1)!);
    // Initials again (its toast waits behind the one before).
    expect(await screen.findByRole("button", { name: "Tambah foto profil" })).toBeTruthy();
  });

  it("says when there is no WAM card yet, and still offers a photo from the gallery", async () => {
    window.history.replaceState(null, "", "/wlm/profil");
    app(mockApi({ latency: [0, 0], noCard: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Tambah foto profil" }));
    expect(await within(dialog()).findByText("Belum ada kartu. Selesaikan kuesioner WAM dulu.")).toBeTruthy();
    expect((within(dialog()).getByRole("button", { name: /Pakai kartu tokoh WAM/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog()).getByRole("button", { name: /Pilih dari galeri/ })).toBeTruthy();
    // A computer (no touch screen): no "Ambil foto".
    expect(within(dialog()).queryByRole("button", { name: /Ambil foto/ })).toBeNull();
  });

  it("shows Strava as Segera hadir in Profil while it is closed, with no sheet and no call (18 Nov 2026)", async () => {
    if (STRAVA_OPEN) return;
    window.history.replaceState(null, "", "/wlm/profil");
    const api = mockApi({ latency: [0, 0] });
    const strava = vi.spyOn(api, "strava");
    app(api);
    const soon = await screen.findByText("Segera hadir");
    expect(soon.closest("button")).toBeNull();
    expect(screen.getByText("Masih dikerjakan")).toBeTruthy();
    expect(strava).not.toHaveBeenCalled();
  });

  // The Strava sheet itself, for when STRAVA_OPEN is true again.
  it.runIf(STRAVA_OPEN)("connects Strava from Profil: what is shared first, then the account, Sinkronkan sekarang and Putuskan (18 Nov 2026)", async () => {
    window.history.replaceState(null, "", "/wlm/profil");
    app();
    fireEvent.click((await screen.findByText("Belum tersambung")).closest("button")!);
    expect(await within(dialog()).findByText(/Yang tampil ke rekan hanya total poin/)).toBeTruthy();
    expect(within(dialog()).getByText(/kamu setuju poin dari aktivitas Strava-mu ikut dihitung/)).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Sambungkan Strava" }));
    expect(await within(dialog()).findByText("Dewi C.")).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Sinkronkan sekarang" }));
    expect(await screen.findByText("Sudah terbaru. Tidak ada aktivitas baru.")).toBeTruthy();
    // Putuskan asks first; the counted activities stay.
    fireEvent.click(within(dialog()).getByRole("button", { name: "Putuskan" }));
    expect(within(dialog()).getByText(/Yang sudah masuk tetap dihitung/)).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Putuskan" }));
    expect(await within(dialog()).findByRole("button", { name: "Sambungkan Strava" })).toBeTruthy();
  });

  it.runIf(STRAVA_OPEN)("says how connecting went after coming back from Strava, and asks to reconnect when Strava refused", async () => {
    window.history.replaceState(null, "", "/wlm/profil?strava=dipakai");
    app(mockApi({ latency: [0, 0], strava: "reconnect" }));
    expect(await screen.findByText("Akun Strava ini sudah tersambung ke karyawan lain.")).toBeTruthy();
    expect(window.location.search).toBe("");
    fireEvent.click((await screen.findByText("Perlu sambung ulang")).closest("button")!);
    expect(await within(dialog()).findByText(/Sambungan terputus/)).toBeTruthy();
    expect(within(dialog()).getByRole("button", { name: "Sambungkan ulang" })).toBeTruthy();
  });

  it("shows points from an admin under Riwayat › Dari admin", async () => {
    window.history.replaceState(null, "", "/wlm/riwayat");
    app();
    fireEvent.click(await screen.findByRole("button", { name: "Dari admin" }));
    expect(await screen.findByText("Hadir Friday Sharing")).toBeTruthy();
  });

  it("follows Admin Wellbeing → Aplikasi karyawan: announcement (closable), prize, photo reading off, Catat paused (17 Nov 2026)", async () => {
    const announcement = { title: "Balapan ditutup 30 Nov", message: "Juara diumumkan Jumat." };
    app(mockApi({ latency: [0, 0], controls: { announcement, prize: "Voucher olahraga", photoReading: false } }));
    const notice = await screen.findByRole("region", { name: "Pengumuman" });
    expect(within(notice).getByText("Balapan ditutup 30 Nov")).toBeTruthy();
    expect(screen.getByText("Voucher olahraga")).toBeTruthy();
    fireEvent.click(within(notice).getByRole("button", { name: "Tutup pengumuman" }));
    expect(screen.queryByRole("region", { name: "Pengumuman" })).toBeNull();
    // Photo reading off: only the manual ways in.
    fireEvent.click(screen.getByRole("button", { name: "Catat" }));
    expect(await within(dialog()).findByText("Kegiatan harian")).toBeTruthy();
    expect(within(dialog()).queryByRole("button", { name: /^Dari foto bukti/ })).toBeNull();

    // Closed on this device: it stays closed on the next visit; a changed one shows again.
    cleanup(); clearResources("wbapp:");
    app(mockApi({ latency: [0, 0], controls: { announcement } }));
    await screen.findByText("Total poin");
    expect(screen.queryByRole("region", { name: "Pengumuman" })).toBeNull();
    cleanup(); clearResources("wbapp:");
    app(mockApi({ latency: [0, 0], controls: { announcement: { ...announcement, message: "Juara diumumkan Senin." }, pausedMessage: "Dibuka lagi Senin pukul 08.00." } }));
    expect(await screen.findByRole("region", { name: "Pengumuman" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Catat" }));
    expect(await within(dialog()).findByText("Dibuka lagi Senin pukul 08.00.")).toBeTruthy();
    expect(within(dialog()).queryByText("Kegiatan harian")).toBeNull();
  });

  it("shows Coba lagi when Beranda cannot load, and loads on retry", async () => {
    const base = fast();
    const home = vi.fn<WellbeingApi["home"]>().mockRejectedValueOnce(new WellbeingApiError("Server belum bisa dihubungi.", 503)).mockImplementation(() => base.home());
    app({ ...base, home });
    fireEvent.click(await screen.findByRole("button", { name: "Coba lagi" }));
    expect(await screen.findByText("Total poin")).toBeTruthy();
  });
});
