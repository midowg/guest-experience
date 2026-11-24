import axe from "axe-core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { LangProvider } from "@/components/main-wam/i18n";
import { setActiveLang } from "@/lib/main-wam/i18n";
import { misiDetectApi } from "@/lib/main-wam/misi/detect-routes";
import { missionItems, summarize, type FromPhoto, type MisiView } from "@/lib/main-wam/misi/missions";
import { sampleCompletions, sampleFromPhotos, sampleMissions } from "@/lib/main-wam/misi/sample";
import { mainWamApi } from "@/lib/routes";
import { MisiScreen } from "./MisiScreen";
import { AutoSwitch } from "./AutoSwitch";
import { SettingsScreen } from "@/components/main-wam/peserta/saya/SettingsScreen";

/*
 * "Dari fotomu" on the Misi page and the switch "Deteksi misi otomatis" (docs/main-wam/KONTRAK.md §13): what was sent by itself (with Tarik while
 * nobody has decided), what is only suggested (Ajukan, Abaikan), "Periksa fotoku", and the switch that makes detection only suggest.
 */

const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/wam2026/misi" }));
vi.mock("@/components/main-wam/theme/font", () => ({ mainWamFontVars: "" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));
const request = vi.hoisted(() => vi.fn());
vi.mock("./request", async original => ({ ...(await original<object>()), misiRequest: request }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
beforeEach(() => { Object.values(router).forEach(fn => fn.mockClear()); request.mockReset(); request.mockResolvedValue({ data: null, message: "" }); });
afterEach(() => { cleanup(); setActiveLang("id"); });

const NOW = new Date("2027-01-05T10:00:00+07:00");
const ME = "00000000-0000-4000-8001-000000000001";
const page = (over: Partial<MisiView> = {}): MisiView => {
  const items = missionItems(sampleMissions, sampleCompletions(ME), { sessions: [], settings: { defaultRadiusM: 50 }, now: NOW });
  return { migrated: true, sample: false, items, summary: summarize(items), points: 3400, place: { rank: 7, of: 118 }, leaderboardOpen: true, taggedIn: [], fromPhotos: sampleFromPhotos(items), autoDetect: true, autoDetectSaved: true, ...over };
};
const screenOf = (view: MisiView) => render(<LangProvider lang="id"><MisiScreen view={view} /></LangProvider>);
const section = () => screen.getByRole("region", { name: /Dari fotomu/ });

describe("Dari fotomu", () => {
  it("lists my Momen photos that meet a mission: the picture, the mission and its points, what was done and how sure it is", () => {
    screenOf(page());
    const rows = within(section()).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(section()).getByRole("heading", { name: /Dari fotomu · 3/ })).toBeTruthy();
    const sent = rows[0];
    expect(sent.textContent).toContain("Sunrise dari hotel");
    expect(sent.textContent).toContain("+500");
    expect(sent.textContent).toContain("Diajukan otomatis");
    expect(sent.textContent).toContain("Cocok");
    expect(within(sent).getByRole("img", { name: "Foto Momen untuk misi Sunrise dari hotel" }).getAttribute("src")).toBe("/wam/demo/foto-20.svg");
    expect(rows[1].textContent).toContain("Saran");
    expect(rows[2].textContent).toContain("Mungkin cocok");
  });

  it("a real photo's picture comes from the Momen photo's own file, small", () => {
    const view = page({ fromPhotos: [{ ...(sampleFromPhotos(page().items)[0] as FromPhoto), thumb: undefined }] });
    screenOf(view);
    expect(within(section()).getByRole("img").getAttribute("src")).toBe(mainWamApi.photoFile(view.fromPhotos![0].photoId, "kecil"));
  });

  it("Tarik takes back a proof that nobody has decided, and is only there while that holds", async () => {
    const view = page({ sample: false });
    screenOf(view);
    const sent = within(section()).getAllByRole("listitem")[0];
    fireEvent.click(within(sent).getByRole("button", { name: "Tarik" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(misiDetectApi.takeBack(view.fromPhotos![0].missionId), { method: "DELETE" }));
    await waitFor(() => expect(within(section()).getAllByRole("listitem")).toHaveLength(2));
    expect(router.refresh).toHaveBeenCalled();
    cleanup();
    screenOf(page({ fromPhotos: [{ ...(page().fromPhotos![0]), canTakeBack: false, state: "done" }] }));
    expect(within(section()).queryByRole("button", { name: "Tarik" })).toBeNull();
  });

  it("Ajukan sends a suggestion from the photo that is already there (the photo's id, not an upload), then it can be taken back; Abaikan drops it", async () => {
    const view = page();
    screenOf(view);
    const suggestion = within(section()).getAllByRole("listitem")[1];
    fireEvent.click(within(suggestion).getByRole("button", { name: "Ajukan" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(misiDetectApi.submit(view.fromPhotos![1].missionId), { method: "POST", json: { photoId: view.fromPhotos![1].photoId } }));
    await waitFor(() => expect(within(section()).getAllByRole("listitem")[1].textContent).toContain("Kamu ajukan"));
    expect(within(within(section()).getAllByRole("listitem")[1]).getByRole("button", { name: "Tarik" })).toBeTruthy();
    const other = within(section()).getAllByRole("listitem")[2];
    fireEvent.click(within(other).getByRole("button", { name: "Abaikan" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(misiDetectApi.submit(view.fromPhotos![2].missionId), { method: "DELETE", json: { photoId: view.fromPhotos![2].photoId } }));
    await waitFor(() => expect(within(section()).getAllByRole("listitem")).toHaveLength(2));
  });

  it("a refusal is said in words and the row stays", async () => {
    request.mockRejectedValue(Object.assign(new Error("Foto ini belum memenuhi syarat misi."), { name: "MisiError" }));
    screenOf(page());
    fireEvent.click(within(within(section()).getAllByRole("listitem")[1]).getByRole("button", { name: "Ajukan" }));
    await waitFor(() => expect(within(section()).getAllByRole("alert").length).toBeGreaterThan(0));
    expect(within(section()).getAllByRole("listitem")).toHaveLength(3);
  });

  it("Periksa fotoku looks at the photos never looked at and says how many matched", async () => {
    request.mockResolvedValue({ data: { checked: 12, results: [{}, {}] }, message: "" });
    screenOf(page());
    fireEvent.click(within(section()).getByRole("button", { name: "Periksa fotoku" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(misiDetectApi.checkMine, { method: "POST" }));
    expect(await within(section()).findByText("12 foto diperiksa, 2 cocok dengan misi.")).toBeTruthy();
    request.mockResolvedValue({ data: { checked: 0, results: [] }, message: "" });
    fireEvent.click(within(section()).getByRole("button", { name: "Periksa fotoku" }));
    expect(await within(section()).findByText("Semua fotomu sudah diperiksa.")).toBeTruthy();
  });

  it("with nothing yet it says so and still offers Periksa fotoku and the switch", () => {
    screenOf(page({ fromPhotos: [] }));
    expect(within(section()).getByText("Belum ada foto Momen yang cocok dengan misi.")).toBeTruthy();
    expect(within(section()).getByRole("button", { name: "Periksa fotoku" })).toBeTruthy();
    expect(within(section()).getByRole("switch", { name: "Deteksi misi otomatis" })).toBeTruthy();
  });

  it("is not on the page before detection exists (an older server answer)", () => {
    screenOf(page({ fromPhotos: undefined }));
    expect(screen.queryByRole("region", { name: /Dari fotomu/ })).toBeNull();
  });

  it("in Mode demo nothing is sent to the server", async () => {
    screenOf(page({ sample: true }));
    fireEvent.click(within(within(section()).getAllByRole("listitem")[0]).getByRole("button", { name: "Tarik" }));
    fireEvent.click(within(within(section()).getAllByRole("listitem")[0]).getByRole("button", { name: "Ajukan" }));
    fireEvent.click(within(section()).getByRole("button", { name: "Periksa fotoku" }));
    expect(request).not.toHaveBeenCalled();
  });

  it("has no accessibility violation, in English too", async () => {
    screenOf(page());
    const result = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map(violation => violation.id)).toEqual([]);
    cleanup();
    setActiveLang("en");
    render(<LangProvider lang="en"><MisiScreen view={page()} /></LangProvider>);
    expect(screen.getByRole("heading", { name: /From your photos · 3/ })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Take back" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Check my photos" })).toBeTruthy();
  });
});

describe("the switch Deteksi misi otomatis", () => {
  it("is on by default; turning it off is saved and then photos are only suggested; a failure puts it back", async () => {
    render(<LangProvider lang="id"><AutoSwitch initial saved /></LangProvider>);
    const toggle = screen.getByRole("switch", { name: "Deteksi misi otomatis" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/diajukan sendiri/)).toBeTruthy();
    fireEvent.click(toggle);
    await waitFor(() => expect(request).toHaveBeenCalledWith(misiDetectApi.switch, { method: "PUT", json: { on: false } }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Deteksi misi otomatis" }).getAttribute("aria-checked")).toBe("false"));
    expect(screen.getByText(/hanya disarankan/)).toBeTruthy();
    request.mockRejectedValue(Object.assign(new Error("Gagal."), { name: "MisiError" }));
    fireEvent.click(screen.getByRole("switch", { name: "Deteksi misi otomatis" }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Deteksi misi otomatis" }).getAttribute("aria-checked")).toBe("false"));
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });

  it("cannot be changed before the system update, and says suggestions are all there is", () => {
    render(<LangProvider lang="id"><AutoSwitch initial saved={false} /></LangProvider>);
    const toggle = screen.getByRole("switch", { name: "Deteksi misi otomatis" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/baru bisa disimpan setelah pembaruan sistem/)).toBeTruthy();
  });
});

describe("the switch in Pengaturan", () => {
  const settings = (missionDetect: { on: boolean; saved: boolean } | null) => render(<LangProvider lang="id"><SettingsScreen version="0.1.0" missionDetect={missionDetect} preview={{ push: "on", installed: false }} /></LangProvider>);

  it("has its own group, Misi, between Aplikasi and Akun, for someone who takes part in Misi", () => {
    settings({ on: true, saved: true });
    expect(screen.getAllByRole("heading", { level: 2 }).map(heading => heading.textContent)).toEqual(["Tampilan", "Aplikasi", "Misi", "Akun", "Bantuan"]);
    expect(screen.getByRole("switch", { name: "Deteksi misi otomatis" }).getAttribute("aria-checked")).toBe("true");
  });

  it("is not there for a BOD or when Misi is off (no such row)", () => {
    settings(null);
    expect(screen.queryByRole("switch", { name: "Deteksi misi otomatis" })).toBeNull();
    expect(screen.getAllByRole("heading", { level: 2 }).map(heading => heading.textContent)).toEqual(["Tampilan", "Aplikasi", "Akun", "Bantuan"]);
  });

  it("in the dev preview it flips without asking the server", () => {
    settings({ on: true, saved: true });
    fireEvent.click(screen.getByRole("switch", { name: "Deteksi misi otomatis" }));
    expect(screen.getByRole("switch", { name: "Deteksi misi otomatis" }).getAttribute("aria-checked")).toBe("false");
    expect(request).not.toHaveBeenCalled();
  });
});
