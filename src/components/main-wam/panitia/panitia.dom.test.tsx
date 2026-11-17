import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@/components/main-wam/ui";
import { mainWamPath } from "@/lib/routes";
import { sampleSessionIds } from "@/lib/main-wam/sample";
import { announceSample, attendanceData, bodRows, moderationHidden, moderationReported, panitiaHome, rundownHistory, rundownSessions, sampleDays } from "@/app/dev-preview/main-wam/panitia/sample";
import { PanitiaApiContext, PanitiaError, type PanitiaApi } from "./api";
import { AbsenManual } from "./AbsenManual";
import { AnnounceForm } from "./AnnounceForm";
import { KelolaCards, RingkasanCard } from "./BerandaCards";
import { Moderation } from "./Moderation";
import { RundownLive } from "./RundownLive";

/* The panitia's and BOD's screens as a person uses them: the sheet, the dialogs, the toasts, the calls. */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/wam/acara" }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
beforeEach(() => { window.history.replaceState(null, "", "/wam/acara"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function fakeApi(overrides: Partial<PanitiaApi> = {}): PanitiaApi {
  return {
    changeSession: vi.fn(async (_id, input) => ({ changed: 3, notified: input.notify, recipients: input.notify ? 122 : 0, versions: {} })),
    silent: vi.fn(async () => undefined),
    attendance: vi.fn(async () => ({ rows: [] })),
    setPresent: vi.fn(async () => ({ rows: attendanceData().rows.map(row => row.name === "Bima" ? { ...row, checkedInAt: "2027-01-05T03:16:00Z", method: "manual" as const } : row) })),
    announce: vi.fn(async () => ({ count: 122 })),
    unpin: vi.fn(async () => undefined),
    removeAnnouncement: vi.fn(async () => undefined),
    moderate: vi.fn(async () => undefined),
    refresh: vi.fn(),
    navigate: vi.fn(),
    ...overrides,
  };
}
const withApi = (api: PanitiaApi, node: ReactNode) => render(<ToastProvider><PanitiaApiContext.Provider value={api}>{node}</PanitiaApiContext.Provider></ToastProvider>);
const rundown = (api: PanitiaApi, variant: "awal" | "silent-dibuka" = "awal", now = "2027-01-05T10:15:00+07:00") => withApi(api,
  <RundownLive migrated day={2} days={sampleDays(2, mainWamPath.rundownLive)} sessions={rundownSessions(variant)} history={rundownHistory} recipients={122} now={now} me="Dimas" />);

describe("Rundown live (K02) and Ubah jam (K03)", () => {
  it("shows the day, the running session, Silent Meeting's state and who changed what", () => {
    rundown(fakeApi());
    expect(screen.getByText("Sedang berlangsung")).toBeTruthy();
    expect(screen.getByText("Belum dibuka")).toBeTruthy();
    expect(screen.getByText("diubah Dimas · 08.05")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Buka Silent Meeting" })).toBeTruthy();
    // A session that is over has nothing to change.
    expect(screen.queryByRole("button", { name: "Ubah jam Wellness pagi" })).toBeNull();
  });

  it("moves the sessions it runs into, tells everyone, and marks the rows (prototype K03 → K02__status)", async () => {
    const api = fakeApi();
    rundown(api);
    fireEvent.click(screen.getByRole("button", { name: "Ubah jam Pemaparan departemen" }));
    const sheet = screen.getByRole("dialog", { name: "Ubah jam · Pemaparan departemen" });
    fireEvent.change(within(sheet).getByLabelText("Selesai"), { target: { value: "12.30" } });
    expect(within(sheet).getByText("Tadinya 08.00–12.00 · +30 menit")).toBeTruthy();
    expect(within(sheet).getByText("Sesi berikutnya ikut bergeser +30 menit")).toBeTruthy();
    expect(within(sheet).getByRole("checkbox", { name: /Makan siang/ }).getAttribute("aria-checked")).toBe("true");
    expect(within(sheet).getByRole("checkbox", { name: /Team building/ }).getAttribute("aria-checked")).toBe("false");
    expect(within(sheet).getByText("Notifikasi ke 122 orang")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(screen.getByText("Kabar terkirim ke 122 orang")).toBeTruthy());
    expect(api.changeSession).toHaveBeenCalledWith(sampleSessionIds.pemaparan, expect.objectContaining({
      action: "jam", notify: true, shift: [{ id: sampleSessionIds["makan-siang-2"], version: expect.any(String) }, { id: sampleSessionIds.silent, version: expect.any(String) }],
    }));
    expect(screen.getAllByText(/diubah Dimas/).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("08.00–12.30")).toBeTruthy();
  });

  it("stops Simpan while a session that stays clashes, with the reason next to it (prototype K03__status)", () => {
    rundown(fakeApi());
    fireEvent.click(screen.getByRole("button", { name: "Ubah jam Pemaparan departemen" }));
    const sheet = screen.getByRole("dialog");
    fireEvent.change(within(sheet).getByLabelText("Selesai"), { target: { value: "13.00" } });
    fireEvent.click(within(sheet).getByRole("checkbox", { name: /Team building/ }));
    expect(within(sheet).getByText("Bentrok. Centang atau ubah jamnya.")).toBeTruthy();
    expect((within(sheet).getByRole("button", { name: "Simpan" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says who changed it meanwhile and offers to reload", async () => {
    const api = fakeApi({ changeSession: vi.fn(async () => { throw new PanitiaError("Jadwal ini baru saja diubah Sari. Muat ulang untuk melihat jam terbaru.", 409); }) });
    rundown(api);
    fireEvent.click(screen.getByRole("button", { name: "Ubah jam Pemaparan departemen" }));
    const sheet = screen.getByRole("dialog");
    fireEvent.change(within(sheet).getByLabelText("Selesai"), { target: { value: "12.30" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(within(sheet).getByText(/baru saja diubah Sari/)).toBeTruthy());
    fireEvent.click(within(sheet).getByRole("button", { name: "Muat ulang" }));
    expect(api.refresh).toHaveBeenCalled();
  });

  it("closes an open Silent Meeting only after asking (area D's control)", async () => {
    const api = fakeApi();
    rundown(api, "silent-dibuka", "2027-01-05T14:40:00+07:00");
    expect(screen.getByText("Dibuka · 41 masukan")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tutup Silent Meeting" }));
    const dialog = screen.getByRole("alertdialog", { name: "Tutup sekarang?" });
    expect(within(dialog).getByText("Peserta tidak bisa mengirim masukan lagi.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Tutup" }));
    await waitFor(() => expect(api.silent).toHaveBeenCalledWith(expect.any(String), "tutup"));
  });
});

describe("Absen sesi (K05)", () => {
  it("records someone present with Urungkan, and finds by name", async () => {
    const api = fakeApi();
    const data = attendanceData();
    withApi(api, <AbsenManual {...data} />);
    expect(screen.getByText("112 dari 120 hadir")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Belum hadir (8)" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Catat hadir Bima" }));
    expect(screen.getByRole("radio", { name: "Belum hadir (7)" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Bima dicatat hadir")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Urungkan" })).toBeTruthy();
    expect(api.setPresent).toHaveBeenCalledWith(data.session!.id, { employeeId: expect.any(String), present: true });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "tar" } });
    expect(screen.getAllByRole("button", { name: /^Catat hadir/ }).map(button => button.getAttribute("aria-label"))).toEqual(["Catat hadir Tari"]);
  });

  it("shows how each one checked in, and Semua sudah hadir when nobody is missing", () => {
    withApi(fakeApi(), <AbsenManual {...attendanceData()} initialTab="hadir" />);
    expect(screen.getAllByText("07.52 · Scan QR").length).toBeGreaterThan(0);
    expect(screen.getByText("08.10 · Dicatat panitia")).toBeTruthy();
    cleanup();
    withApi(fakeApi(), <AbsenManual {...attendanceData(true)} />);
    expect(screen.getByText("Semua sudah hadir.")).toBeTruthy();
  });
});

describe("Kirim pengumuman (K06)", () => {
  it("asks for a title, then asks before sending to everyone", async () => {
    const api = fakeApi();
    withApi(api, <AnnounceForm {...announceSample} sent={[]} now="2027-01-05T10:28:00+07:00" />);
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    expect(screen.getByText("Judul wajib diisi.")).toBeTruthy();
    expect(api.announce).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Judul"), { target: { value: "Team building mulai 15.00 di Lawn" } });
    fireEvent.change(screen.getByLabelText("Isi"), { target: { value: "Pakai kaos kelompok dan sepatu olahraga." } });
    expect(screen.getByText("33/60")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    const dialog = screen.getByRole("alertdialog", { name: "Kirim ke 122 orang?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Kirim" }));
    await waitFor(() => expect(screen.getByText("Terkirim ke 122 orang")).toBeTruthy());
    expect(api.announce).toHaveBeenCalledWith({ title: "Team building mulai 15.00 di Lawn", body: "Pakai kaos kelompok dan sepatu olahraga.", audience: { type: "semua" }, pinnedUntil: null });
    expect(api.navigate).toHaveBeenCalledWith(mainWamPath.home);
  });

  it("sends to the chosen kelompok and pins until a time", async () => {
    const api = fakeApi();
    withApi(api, <AnnounceForm {...announceSample} sent={[]} now="2027-01-05T10:28:00+07:00" />);
    fireEvent.change(screen.getByLabelText("Judul"), { target: { value: "Kumpul di pos" } });
    fireEvent.click(screen.getByRole("radio", { name: /Kelompok tertentu/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Kelompok 4 · Arjuno/ }));
    fireEvent.click(screen.getByRole("button", { name: "Selesai" }));
    fireEvent.click(screen.getByRole("switch", { name: "Sematkan di Beranda" }));
    fireEvent.change(screen.getByLabelText("Sampai"), { target: { value: "15.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Kirim ke 10 orang?" })).getByRole("button", { name: "Kirim" }));
    await waitFor(() => expect(api.announce).toHaveBeenCalled());
    expect(api.announce).toHaveBeenCalledWith(expect.objectContaining({ audience: { type: "kelompok", groupIds: [announceSample.counts.groups[3].id] }, pinnedUntil: new Date("2027-01-05T15:00:00+07:00").toISOString() }));
  });
});

describe("Moderasi Momen (K08)", () => {
  it("hides only after asking and moves the card to Disembunyikan; shows again at once", async () => {
    const api = fakeApi();
    withApi(api, <Moderation migrated now="2027-01-05T10:16:00+07:00" reported={moderationReported} hidden={moderationHidden} />);
    expect(screen.getByRole("radio", { name: "Dilaporkan (3)" })).toBeTruthy();
    expect(screen.getByText("Hana · Kelompok 7 · 09.40")).toBeTruthy();
    expect(screen.getByText("Saya ada di foto ini dan tidak setuju · 2")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("article", { name: "Foto dari Hana" })).getByRole("button", { name: "Sembunyikan" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Sembunyikan foto ini?" })).getByRole("button", { name: "Sembunyikan" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Disembunyikan (2)" })).toBeTruthy());
    expect(api.moderate).toHaveBeenCalledWith(moderationReported[0].id, { action: "sembunyikan", from: "ditinjau" });
    fireEvent.click(within(screen.getByRole("article", { name: "Foto dari Putri" })).getByRole("button", { name: "Tampilkan lagi" }));
    await waitFor(() => expect(screen.getByText("Foto tampil lagi")).toBeTruthy());
    expect(api.moderate).toHaveBeenLastCalledWith(moderationReported[1].id, { action: "tampilkan", from: "tampil" });
  });

  it("says Tidak ada laporan. when the queue is empty", () => {
    withApi(fakeApi(), <Moderation migrated now="2027-01-05T10:16:00+07:00" reported={[]} hidden={[]} />);
    expect(screen.getByText("Tidak ada laporan.")).toBeTruthy();
  });
});

describe("Beranda cards (K01, B01)", () => {
  it("draws Kelola and Perlu perhatian as links, with the reports said in words", () => {
    render(<KelolaCards tiles={panitiaHome.tiles} attention={panitiaHome.attention} />);
    expect(screen.getByRole("link", { name: "Moderasi, 3 laporan" }).getAttribute("href")).toBe(mainWamPath.moderation());
    expect(screen.getByRole("link", { name: /8 orang belum absen/ }).getAttribute("href")).toBe(mainWamPath.attendanceManual(sampleSessionIds.pemaparan));
    cleanup();
    render(<KelolaCards tiles={panitiaHome.tiles} attention={[]} />);
    expect(screen.queryByText("Perlu perhatian")).toBeNull();
  });

  it("draws Ringkasan's rows; Jejak karbon is a number, not a link", () => {
    render(<RingkasanCard rows={bodRows.biasa} />);
    expect(screen.getByRole("link", { name: "Kehadiran hari ini, 93%" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Awarding perlu persetujuan, 2" }).getAttribute("href")).toBe(mainWamPath.awardApproval);
    expect(screen.getByText("13,6")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Jejak karbon/ })).toBeNull();
    cleanup();
    render(<RingkasanCard rows={bodRows.kosong} />);
    expect(screen.getAllByText("Belum ada").length).toBe(3);
  });
});
