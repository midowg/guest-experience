import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@/components/main-wam/ui";
import { mainWamPath } from "@/lib/routes";
import { sampleSessionIds } from "@/lib/main-wam/sample";
import { announceSample, attendanceData, bodRows, moderationHidden, moderationReported, panitiaHome, rundownHistory, rundownSessions, sampleDays } from "@/app/dev-preview/wam2026/panitia/sample";
import { PanitiaApiContext, PanitiaError, type PanitiaApi } from "./api";
import { AbsenManual } from "./AbsenManual";
import { AnnounceForm } from "./AnnounceForm";
import { RingkasanCard } from "./BerandaCards";
import { PanitiaHub } from "./PanitiaHub";
import { Moderation } from "./Moderation";
import { RundownLive } from "./RundownLive";

/* The panitia's and BOD's screens as a person uses them: the sheet, the dialogs, the toasts, the calls. */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/wam2026" }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
beforeEach(() => { window.history.replaceState(null, "", "/wam2026"); });
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
/** Lets the kit's history steps finish (jsdom moves through history asynchronously, as browsers do). */
const settle = (ms = 40) => act(() => new Promise<void>(resolve => { window.setTimeout(resolve, ms); }));
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

  it("hands focus back to the row's Ubah jam when the sheet closes, and starts over when it opens again (audit T-K01)", async () => {
    rundown(fakeApi());
    const opener = screen.getByRole("button", { name: "Ubah jam Pemaparan departemen" });
    opener.focus();
    fireEvent.click(opener);
    const sheet = screen.getByRole("dialog", { name: "Ubah jam · Pemaparan departemen" });
    expect(sheet.contains(document.activeElement)).toBe(true);
    fireEvent.change(within(sheet).getByLabelText("Selesai"), { target: { value: "12.30" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Batal" }));
    expect(screen.queryByRole("dialog", { name: "Ubah jam · Pemaparan departemen" })).toBeNull();
    expect(document.activeElement).toBe(opener);
    await settle();
    // Esc closes too, and focus comes back the same way; the typed time is not kept.
    fireEvent.click(opener);
    const again = screen.getByRole("dialog", { name: "Ubah jam · Pemaparan departemen" });
    expect((within(again).getByLabelText("Selesai") as HTMLInputElement).value).toBe("12.00");
    fireEvent.keyDown(again, { key: "Escape" });
    expect(document.activeElement).toBe(opener);
    await settle();
    expect((window.history.state as { mwSheet?: string } | null)?.mwSheet).toBeUndefined();
  });

  it("goes from the session menu straight to a dialog or a sheet, without a stand-in (afterModal removed)", async () => {
    const api = fakeApi();
    rundown(api);
    const menu = screen.getByRole("button", { name: "Pilihan sesi Makan siang" });
    menu.focus();
    fireEvent.click(menu);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Makan siang" })).getByRole("button", { name: "Batalkan sesi" }));
    await settle();
    // The menu let go of its history entry; the dialog took it over and is still open.
    expect(screen.queryByRole("dialog", { name: "Makan siang" })).toBeNull();
    const dialog = screen.getByRole("alertdialog", { name: "Batalkan sesi ini?" });
    expect((window.history.state as { mwSheet?: string } | null)?.mwSheet).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Kembali" }));
    expect(document.activeElement).toBe(menu);
    await settle();
    expect((window.history.state as { mwSheet?: string } | null)?.mwSheet).toBeUndefined();

    fireEvent.click(menu);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Makan siang" })).getByRole("button", { name: "Pindah tempat" }));
    await settle(80);
    const sheet = screen.getByRole("dialog", { name: "Pindah tempat · Makan siang" });
    fireEvent.change(within(sheet).getByLabelText("Tempat"), { target: { value: "Lawn" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(api.changeSession).toHaveBeenCalledWith(sampleSessionIds["makan-siang-2"], expect.objectContaining({ action: "tempat", place: "Lawn" })));
  });

  it("runs past midnight: Selesai at or before Mulai ends the next day, after asking (audit R10)", async () => {
    const api = fakeApi();
    rundown(api);
    fireEvent.click(screen.getByRole("button", { name: "Ubah jam Batu Night Spectacular" }));
    const sheet = screen.getByRole("dialog", { name: "Ubah jam · Batu Night Spectacular" });
    fireEvent.change(within(sheet).getByLabelText("Selesai"), { target: { value: "00.30" } });
    expect(within(sheet).getByText("Selesai besok, Rab, 6 Jan · 00.30")).toBeTruthy();
    expect(within(sheet).queryByText("Jam selesai harus setelah jam mulai.")).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: "Simpan" }));
    const ask = screen.getByRole("alertdialog", { name: "Selesai keesokan harinya?" });
    expect(within(ask).getByText("Batu Night Spectacular selesai Rab, 6 Jan · 00.30.")).toBeTruthy();
    expect(api.changeSession).not.toHaveBeenCalled();
    // Batal goes back to the sheet, nothing saved.
    fireEvent.click(within(ask).getByRole("button", { name: "Batal" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Ubah jam · Batu Night Spectacular" })).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Simpan" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Selesai keesokan harinya?" })).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(api.changeSession).toHaveBeenCalledWith(sampleSessionIds.bns, expect.objectContaining({
      action: "jam", startsAt: new Date("2027-01-05T19:30:00+07:00").toISOString(), endsAt: new Date("2027-01-06T00:30:00+07:00").toISOString(),
    })));
    // Longer than 12 hours is a typo.
    fireEvent.click(screen.getByRole("button", { name: "Ubah jam Batu Night Spectacular" }));
    const typo = screen.getByRole("dialog", { name: "Ubah jam · Batu Night Spectacular" });
    fireEvent.change(within(typo).getByLabelText("Selesai"), { target: { value: "11.00" } });
    expect(within(typo).getByText("Jam selesai harus setelah jam mulai.")).toBeTruthy();
  });

  it("closes an open Silent Meeting only after asking (area D's control)", async () => {
    const api = fakeApi();
    rundown(api, "silent-dibuka", "2027-01-05T14:40:00+07:00");
    // While open: its state only, never a count (audit H2).
    expect(screen.getByText("Dibuka")).toBeTruthy();
    expect(screen.queryByText(/masukan/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tutup Silent Meeting" }));
    const dialog = screen.getByRole("alertdialog", { name: "Tutup sekarang?" });
    // Closing is final, and the dialog says so.
    expect(within(dialog).getByText("Peserta tidak bisa mengirim masukan lagi. Silent Meeting tidak bisa dibuka lagi.")).toBeTruthy();
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

describe("Absen sesi: Batalkan hadir (audit L8)", () => {
  it("offers Batalkan hadir only for someone panitia recorded, never for a QR scan", async () => {
    const data = attendanceData();
    const sari = data.rows.find(row => row.name === "Sari")!;
    const api = fakeApi({ setPresent: vi.fn(async () => ({ rows: data.rows.map(row => row.id === sari.id ? { ...row, checkedInAt: null, method: null } : row) })) });
    withApi(api, <AbsenManual {...data} initialTab="hadir" />);
    // Rani scanned the QR herself: her row is not a button.
    expect(screen.getByText("Rani")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Rani/ })).toBeNull();
    expect(screen.getByText("Ketuk nama yang dicatat panitia untuk membatalkan. Scan QR tidak bisa dibatalkan.")).toBeTruthy();
    // Sari was recorded by panitia: her row opens Batalkan hadir; its name is what it shows (WCAG 2.5.3).
    const row = screen.getByRole("button", { name: /^Sari/ });
    expect(row.getAttribute("aria-label")).toBeNull();
    fireEvent.click(row);
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Batalkan hadir Sari?" })).getByRole("button", { name: "Batalkan hadir" }));
    await waitFor(() => expect(api.setPresent).toHaveBeenCalledWith(data.session!.id, { employeeId: sari.id, present: false }));
    await waitFor(() => expect(screen.getByText("Sari kembali ke Belum hadir")).toBeTruthy());
  });

  it("puts the row back and says why when the server refuses (a QR scan came in meanwhile)", async () => {
    const data = attendanceData();
    const api = fakeApi({ setPresent: vi.fn(async () => { throw new PanitiaError("Sari absen lewat scan QR. Absen ini tidak bisa dibatalkan panitia.", 409); }) });
    withApi(api, <AbsenManual {...data} initialTab="hadir" />);
    fireEvent.click(screen.getByRole("button", { name: /^Sari/ }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Batalkan hadir" }));
    await waitFor(() => expect(screen.getByText("Sari absen lewat scan QR. Absen ini tidak bisa dibatalkan panitia.")).toBeTruthy());
    expect(screen.getByText("08.10 · Dicatat panitia")).toBeTruthy();
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
    expect(api.navigate).toHaveBeenCalledWith(mainWamPath.committee);
  });

  it("goes from a sent announcement straight to Hapus, and Batal hands focus back (afterModal removed)", async () => {
    const api = fakeApi();
    withApi(api, <AnnounceForm {...announceSample} now="2027-01-05T10:28:00+07:00" />);
    const item = announceSample.sent[0];
    const opener = screen.getByRole("button", { name: new RegExp(`^${item.title}`) });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(within(screen.getByRole("dialog", { name: item.title })).getByRole("button", { name: "Hapus" }));
    await settle();
    const dialog = screen.getByRole("alertdialog", { name: "Hapus pengumuman ini?" });
    expect(screen.queryByRole("dialog", { name: item.title })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Batal" }));
    expect(document.activeElement).toBe(opener);
    await settle();
    fireEvent.click(opener);
    fireEvent.click(within(screen.getByRole("dialog", { name: item.title })).getByRole("button", { name: "Hapus" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Hapus pengumuman ini?" })).getByRole("button", { name: "Hapus pengumuman" }));
    await waitFor(() => expect(api.removeAnnouncement).toHaveBeenCalledWith(item.id));
  });

  it("sends to the chosen department and pins until a time", async () => {
    const api = fakeApi();
    withApi(api, <AnnounceForm {...announceSample} sent={[]} now="2027-01-05T10:28:00+07:00" />);
    fireEvent.change(screen.getByLabelText("Judul"), { target: { value: "Kumpul di pos" } });
    fireEvent.click(screen.getByRole("radio", { name: /Departemen tertentu/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /CoE/ }));
    fireEvent.click(screen.getByRole("button", { name: "Selesai" }));
    fireEvent.click(screen.getByRole("switch", { name: "Sematkan di Beranda" }));
    fireEvent.change(screen.getByLabelText("Sampai"), { target: { value: "15.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Kirim ke 30 orang?" })).getByRole("button", { name: "Kirim" }));
    await waitFor(() => expect(api.announce).toHaveBeenCalled());
    expect(api.announce).toHaveBeenCalledWith(expect.objectContaining({ audience: { type: "departemen", departments: ["CoE"] }, pinnedUntil: new Date("2027-01-05T15:00:00+07:00").toISOString() }));
  });
});

describe("Moderasi Momen (K08)", () => {
  it("hides only after asking, with an optional reason, and moves the card to Disembunyikan; shows again at once", async () => {
    const api = fakeApi();
    withApi(api, <Moderation migrated now="2027-01-05T10:16:00+07:00" reported={moderationReported} hidden={moderationHidden} />);
    expect(screen.getByRole("radio", { name: "Dilaporkan (3)" })).toBeTruthy();
    expect(screen.getByText("Hana · 09.40")).toBeTruthy();
    expect(screen.getByText("Saya ada di foto ini dan tidak setuju · 2")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("article", { name: "Foto dari Hana" })).getByRole("button", { name: "Sembunyikan" }));
    const ask = screen.getByRole("dialog", { name: "Sembunyikan foto ini?" });
    expect(within(ask).getByText("Pengunggah diberi kabar dengan alasan: Ada rekan yang tidak setuju.")).toBeTruthy();
    // A quick reason (one at a time) and a note, both optional (audit L8).
    const reasons = within(ask).getByRole("group", { name: "Alasan (opsional)" });
    fireEvent.click(within(reasons).getByRole("button", { name: "Data pribadi" }));
    fireEvent.click(within(reasons).getByRole("button", { name: "Tidak pantas" }));
    expect(within(reasons).getByRole("button", { name: "Tidak pantas" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(reasons).getByRole("button", { name: "Data pribadi" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.change(within(ask).getByLabelText(/Catatan/), { target: { value: " Ada nomor kamar " } });
    fireEvent.click(within(ask).getByRole("button", { name: "Sembunyikan" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Disembunyikan (2)" })).toBeTruthy());
    expect(api.moderate).toHaveBeenCalledWith(moderationReported[0].id, { action: "sembunyikan", from: "ditinjau", reason: "tidak_pantas", note: "Ada nomor kamar" });
    fireEvent.click(screen.getByRole("radio", { name: "Disembunyikan (2)" }));
    expect(screen.getByText(/^Disembunyikan · .+ · Tidak pantas · Ada nomor kamar$/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Dilaporkan (2)" }));
    fireEvent.click(within(screen.getByRole("article", { name: "Foto dari Putri" })).getByRole("button", { name: "Tampilkan lagi" }));
    await waitFor(() => expect(screen.getByText("Foto tampil lagi")).toBeTruthy());
    expect(api.moderate).toHaveBeenLastCalledWith(moderationReported[1].id, { action: "tampilkan", from: "tampil" });
  });

  it("deletes without a reason too, and the hidden card says who hid it and why", async () => {
    const api = fakeApi();
    withApi(api, <Moderation migrated now="2027-01-05T10:16:00+07:00" reported={[]} hidden={moderationHidden} tab="disembunyikan" />);
    expect(screen.getByText("Disembunyikan Dimas · 09.05 · Tidak pantas")).toBeTruthy();
    const opener = within(screen.getByRole("article", { name: "Foto dari Nina" })).getByRole("button", { name: "Hapus" });
    opener.focus();
    fireEvent.click(opener);
    const ask = screen.getByRole("dialog", { name: "Hapus foto ini?" });
    // Batal: nothing happens, focus back on Hapus.
    fireEvent.click(within(ask).getByRole("button", { name: "Batal" }));
    expect(api.moderate).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);
    fireEvent.click(opener);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Hapus foto ini?" })).getByRole("button", { name: "Hapus foto" }));
    await waitFor(() => expect(screen.getByText("Foto dihapus")).toBeTruthy());
    expect(api.moderate).toHaveBeenCalledWith(moderationHidden[0].id, { action: "hapus", from: "disembunyikan", reason: null, note: "" });
  });

  it("says Tidak ada laporan. when the queue is empty", () => {
    withApi(fakeApi(), <Moderation migrated now="2027-01-05T10:16:00+07:00" reported={[]} hidden={[]} />);
    expect(screen.getByText("Tidak ada laporan.")).toBeTruthy();
  });
});

describe("Panitia hub (K01) and Beranda card (B01)", () => {
  it("draws what is running, Kelola and Perlu perhatian as links, with the reports said in words", () => {
    render(<PanitiaHub tiles={panitiaHome.tiles} attention={panitiaHome.attention} running={panitiaHome.running} />);
    expect(screen.getByRole("heading", { name: "Sedang berjalan" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Kelola" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Moderasi\s*, 3 laporan$/ }).getAttribute("href")).toBe(mainWamPath.moderation());
    expect(screen.getByRole("link", { name: /8 orang belum absen/ }).getAttribute("href")).toBe(mainWamPath.attendanceManual(sampleSessionIds.pemaparan));
    cleanup();
    render(<PanitiaHub tiles={panitiaHome.tiles} attention={[]} />);
    expect(screen.queryByText("Perlu perhatian")).toBeNull();
    expect(screen.queryByText("Sedang berjalan")).toBeNull();
  });

  it("draws Ringkasan's rows; Jejak karbon opens its page", () => {
    render(<RingkasanCard rows={bodRows.biasa} />);
    // A row's name is its visible text, no separate label (WCAG 2.5.3, audit T-S05).
    expect(screen.getByRole("link", { name: /^Kehadiran hari ini\s*93%$/ }).getAttribute("aria-label")).toBeNull();
    expect(screen.getByRole("link", { name: /^Awarding perlu persetujuan\s*2$/ }).getAttribute("href")).toBe(mainWamPath.awardApproval);
    expect(screen.getByText("13,6")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Jejak karbon/ }).getAttribute("href")).toBe(mainWamPath.carbon());
    cleanup();
    render(<RingkasanCard rows={bodRows.kosong} />);
    expect(screen.getAllByText("Belum ada").length).toBe(3);
    cleanup();
    // A small Jejak karbon is in kilograms, never "0,0 t" (audit R16).
    render(<RingkasanCard rows={bodRows.karbonKecil} />);
    expect(screen.getByText("46")).toBeTruthy();
    expect(screen.getByText("kg CO₂e")).toBeTruthy();
    expect(screen.queryByText("0,0")).toBeNull();
  });
});
