import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { clearResources } from "@/components/app-shell/resource";
import { WellbeingApiError, type WellbeingApi } from "./api";
import { mockApi, sampleMe } from "./mock-api";
import { sectionOf, WellbeingApp } from "./WellbeingApp";

// usePathname follows the address, as Next does after history.pushState / replaceState.
const route = vi.hoisted(() => ({ listeners: new Set<() => void>() }));
vi.mock("next/navigation", async () => {
  const React = await import("react");
  return {
    usePathname: () => React.useSyncExternalStore(listener => { route.listeners.add(listener); return () => { route.listeners.delete(listener); }; }, () => window.location.pathname),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  };
});

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
beforeEach(() => { window.history.replaceState(null, "", "/wellbeing"); });
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
    expect(sectionOf("/wellbeing")).toBe("beranda");
    expect(sectionOf("/wellbeing/peringkat")).toBe("peringkat");
    expect(sectionOf("/wellbeing/apa")).toBe("beranda");
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
    expect(window.location.pathname).toBe("/wellbeing/riwayat");
    await screen.findByRole("group", { name: "Jenis aktivitas" });
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
    expect(window.location.pathname).toBe("/wellbeing/profil");
    expect(window.history.length).toBe(before + 1);
    await screen.findByText("Riwayat poin");

    act(() => { window.history.back(); });
    await waitFor(() => expect(window.location.pathname).toBe("/wellbeing"));
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

  it("shows Coba lagi when Beranda cannot load, and loads on retry", async () => {
    const base = fast();
    const home = vi.fn<WellbeingApi["home"]>().mockRejectedValueOnce(new WellbeingApiError("Server belum bisa dihubungi.", 503)).mockImplementation(() => base.home());
    app({ ...base, home });
    fireEvent.click(await screen.findByRole("button", { name: "Coba lagi" }));
    expect(await screen.findByText("Total poin")).toBeTruthy();
  });
});
