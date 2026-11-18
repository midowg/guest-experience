import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { sampleAdminGuides, sampleAdminLog, sampleAdminPeople, sampleAdminSessions, sampleAdminSettings } from "@/lib/main-wam/admin/sample";
import { sampleSessionIds } from "@/lib/main-wam/sample";
import { eventDates } from "@/lib/main-wam/rundown";
import { mainWamAdminApi, wamAdminPath } from "@/lib/routes";
import { AdminApiError } from "@/components/admin/shared/api";

const request = vi.fn();
vi.mock("@/components/admin/shared/api", async importOriginal => ({ ...(await importOriginal<object>()), adminRequest: (...args: unknown[]) => request(...args) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode; scroll?: boolean }) => { delete props.scroll; return <a href={href} {...props}>{children}</a>; } }));
const { RundownEditor } = await import("./RundownEditor");
const { EventInfoEditor } = await import("./EventInfoEditor");

// jsdom has no modal dialogs.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); request.mockReset(); });

const dates = eventDates(sampleAdminSettings().event);
const guides = sampleAdminGuides.map(guide => ({ id: guide.id, title: guide.title, kind: guide.kind }));
const rundown = (props: Partial<Parameters<typeof RundownEditor>[0]> = {}) => render(<RundownEditor initial={sampleAdminSessions()} migrated dates={dates} people={sampleAdminPeople}
  guides={guides} log={sampleAdminLog} today={dates[1]} crumbs={[]} title="Main WAM · Rundown" {...props} />);

describe("Rundown", () => {
  it("shows one day as a timeline, with status, absen, wajib and who changed it", () => {
    rundown();
    const day = screen.getByRole("list", { name: /Rundown Hari 2/ });
    const pemaparan = within(day).getByRole("article", { name: /Pemaparan departemen/ });
    expect(within(pemaparan).getByText("Terbit")).toBeTruthy();
    expect(within(pemaparan).getByText("Absen")).toBeTruthy();
    expect(within(pemaparan).getByText("Wajib")).toBeTruthy();
    expect(within(pemaparan).getByText(/diubah Dimas Contoh · 10\.20/)).toBeTruthy();
    expect(within(day).getByRole("article", { name: /Batu Night Spectacular/ }).textContent).toContain("Batal");
    // Switching the day swaps the list without leaving the page.
    fireEvent.click(screen.getByRole("button", { name: "Hari 4 · Kam, 7 Jan" }));
    expect(screen.getByRole("list", { name: /Rundown Hari 4/ }).textContent).toContain("Pasar Among Tani");
  });

  it("says plainly when the rundown waits for the system update, without file names, and locks adding (audit T-A01)", () => {
    rundown({ initial: [], migrated: false });
    const notice = screen.getByText(/menunggu pembaruan sistem/);
    expect(notice.textContent).toBe("Rundown menunggu pembaruan sistem, jadi isinya belum bisa disimpan. Hubungi tim CoE.");
    expect(document.body.textContent).not.toMatch(/migrasi|\.sql|2026112/);
    expect((screen.getByRole("button", { name: "Tambah sesi" }) as HTMLButtonElement).disabled).toBe(true);
    // The empty state's title is the page's next heading (h2 under h1).
    expect(screen.getByRole("heading", { level: 2, name: "Rundown belum bisa diisi" })).toBeTruthy();
  });

  it("turns Hapus off for a session with absen and photos, says why, and offers Batalkan instead (audit M4)", async () => {
    rundown();
    const hapus = screen.getByRole("button", { name: "Hapus Pemaparan departemen" });
    expect(hapus.getAttribute("aria-disabled")).toBe("true");
    expect(hapus.getAttribute("title")).toBe("Tidak bisa dihapus: sudah punya 96 absen dan 12 foto Momen. Pakai Batalkan.");
    expect(document.getElementById(hapus.getAttribute("aria-describedby")!)!.textContent).toMatch(/sudah punya 96 absen dan 12 foto Momen/);
    fireEvent.click(hapus);
    const dialog = await screen.findByRole("dialog", { name: "Sesi ini tidak bisa dihapus" });
    expect(dialog.textContent).toContain("Pemaparan departemen sudah punya 96 absen dan 12 foto Momen.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Batalkan sesi" }));
    const sheet = await screen.findByRole("dialog", { name: "Batalkan sesi" });
    expect((within(sheet).getByRole("radio", { name: "Batal" }) as HTMLInputElement).checked).toBe(true);
    expect(within(sheet).getByText(/Status: Terbit jadi Batal/)).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
  });

  it("names the Silent Meeting and Awarding that keep a session (no feedback count)", () => {
    rundown();
    expect(screen.getByRole("button", { name: "Hapus Silent Meeting" }).getAttribute("title")).toBe("Tidak bisa dihapus: sudah punya 41 absen dan pertanyaan Silent Meeting. Pakai Batalkan.");
  });

  it("asks before deleting a session without records, saying its kelompok kegiatan go with it", async () => {
    request.mockResolvedValue({ message: "Sesi dihapus.", data: { sessions: sampleAdminSessions() } });
    rundown();
    const hapus = screen.getByRole("button", { name: "Hapus Team building" });
    expect(hapus.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(hapus);
    const dialog = await screen.findByRole("dialog", { name: "Hapus sesi?" });
    expect(dialog.textContent).toContain("6 kelompok kegiatannya ikut terhapus.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Hapus sesi" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0]).toEqual([mainWamAdminApi.session(sampleSessionIds["team-building"]), { method: "DELETE", body: undefined }]);
  });

  it("moves sessions with the versions on screen; a refusal shows inside the sheet, which stays open (audit S7)", async () => {
    request.mockRejectedValue(new AdminApiError("Pemaparan departemen baru saja diubah orang lain (mungkin lewat Rundown live), jadi tidak ada yang digeser.", undefined, 409));
    rundown();
    fireEvent.click(screen.getByRole("button", { name: "Geser jam" }));
    const sheet = screen.getByRole("dialog", { name: "Geser jam" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Pilih Pemaparan departemen dan sesudahnya" }));
    fireEvent.click(within(sheet).getByRole("button", { name: /^Geser \d+ sesi$/ }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const body = JSON.parse((request.mock.calls[0][1] as { body: string }).body);
    const pemaparan = sampleAdminSessions().find(session => session.id === sampleSessionIds.pemaparan)!;
    expect(body).toMatchObject({ action: "geser", minutes: 30 });
    expect(body.items[0]).toEqual({ id: pemaparan.id, version: pemaparan.version });
    expect(body).not.toHaveProperty("ids");
    expect((await within(sheet).findByRole("alert")).textContent).toMatch(/baru saja diubah orang lain/);
    expect(screen.getByRole("dialog", { name: "Geser jam" })).toBeTruthy();
  });

  it("logs and tells participants when a published session's time changes", async () => {
    const sessions = sampleAdminSessions();
    request.mockResolvedValue({ message: "Sesi tersimpan. Kabar terkirim ke 122 orang.", data: { sessions, recipients: 122 } });
    rundown();
    fireEvent.click(screen.getByRole("button", { name: "Ubah Pemaparan departemen" }));
    const sheet = screen.getByRole("dialog", { name: "Ubah sesi" });
    fireEvent.change(within(sheet).getByLabelText(/Selesai/), { target: { value: "13:00" } });
    expect(within(sheet).getByText(/Selesai: 12\.30 jadi 13\.00/)).toBeTruthy();
    expect((within(sheet).getByRole("switch", { name: /Kabari peserta/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(sheet).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0][0]).toBe(mainWamAdminApi.session(sampleSessionIds.pemaparan));
    const body = JSON.parse((request.mock.calls[0][1] as { body: string }).body);
    expect(body).toMatchObject({ notify: true, session: { end: "13:00", date: "2027-01-05", required: true } });
    expect(await screen.findByText("Sesi tersimpan. Kabar terkirim ke 122 orang.")).toBeTruthy();
  });

  it("checks the form before sending (wajib needs absen, end after start)", () => {
    rundown();
    fireEvent.click(screen.getAllByRole("button", { name: "Tambah sesi" })[0]);
    const sheet = screen.getByRole("dialog", { name: "Tambah sesi" });
    fireEvent.change(within(sheet).getByLabelText("Judul"), { target: { value: "Rapat" } });
    fireEvent.change(within(sheet).getByLabelText(/Selesai/), { target: { value: "07:00" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Tambah sesi" }));
    expect(within(sheet).getByText("Jam selesai harus setelah jam mulai.")).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
    // Wajib switches absen on with it.
    fireEvent.click(within(sheet).getByRole("switch", { name: /Wajib hadir/ }));
    expect((within(sheet).getByRole("switch", { name: /Pakai absen/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("previews a pasted rundown row by row and saves only when every row is right", async () => {
    request.mockResolvedValue({ message: "1 sesi ditambahkan dari spreadsheet.", data: { sessions: sampleAdminSessions(), added: 1 } });
    rundown();
    fireEvent.click(screen.getAllByRole("button", { name: "Impor" })[0]);
    const sheet = screen.getByRole("dialog", { name: "Impor rundown" });
    const box = within(sheet).getByLabelText("Tempel dari Excel");
    fireEvent.change(box, { target: { value: "Hari\tMulai\tSelesai\tJudul\n9\t08.00\t09.00\tRapat\n3\t13.00\t14.00\tRapat pagi" } });
    expect(await within(sheet).findByText(/1 dari 2 baris perlu diperbaiki/)).toBeTruthy();
    expect((within(sheet).getByRole("button", { name: /^Simpan/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box, { target: { value: "Hari\tMulai\tSelesai\tJudul\n3\t13.00\t14.00\tRapat pagi" } });
    expect(await within(sheet).findByText(/1 baris siap disimpan/)).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Simpan 1 sesi" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(JSON.parse((request.mock.calls[0][1] as { body: string }).body)).toMatchObject({ action: "impor", sessions: [{ title: "Rapat pagi", date: "2027-01-06", start: "13:00", end: "14:00", status: "draf" }] });
  });
});

describe("Info acara", () => {
  it("saves one card at a time, primary only while it has changes", async () => {
    const settings = sampleAdminSettings();
    request.mockResolvedValue({ message: "Info acara tersimpan.", data: { ...settings, event: { ...settings.event, address: "Jl. Contoh No. 2, Kota Batu" } } });
    render(<EventInfoEditor initial={settings} people={sampleAdminPeople} crumbs={[]} title="Main WAM · Info acara" />);
    const hotel = screen.getByRole("region", { name: "Hotel" });
    const save = within(hotel).getByRole("button", { name: "Tersimpan" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(hotel).getByLabelText(/Alamat/), { target: { value: "Jl. Contoh No. 2, Kota Batu" } });
    fireEvent.click(within(hotel).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0][0]).toBe(mainWamAdminApi.eventInfo);
    expect(JSON.parse((request.mock.calls[0][1] as { body: string }).body)).toMatchObject({ address: "Jl. Contoh No. 2, Kota Batu", checkIn: { date: "2027-01-04", time: "15:30" } });
    expect(await within(hotel).findByRole("button", { name: "Tersimpan" })).toBeTruthy();
  });

  it("names where the event's dates come from, without another event's name (audit T-A02)", () => {
    render(<EventInfoEditor initial={sampleAdminSettings()} people={sampleAdminPeople} crumbs={[]} title="Main WAM · Info acara" />);
    const acara = screen.getByRole("region", { name: "Acara" });
    expect(acara.textContent).toContain("Tanggal acara: Sen, 4 Jan sampai Kam, 7 Jan. Diatur di Acara dan modul.");
    expect(acara.textContent).not.toContain("WAM 2027");
    expect(within(acara).getByRole("link", { name: "Acara dan modul" }).getAttribute("href")).toBe(wamAdminPath.events);
  });

  it("lets the hotel bills be final only with all four", () => {
    render(<EventInfoEditor initial={sampleAdminSettings()} people={sampleAdminPeople} crumbs={[]} title="Main WAM · Info acara" />);
    const bills = screen.getByRole("region", { name: "Tagihan hotel" });
    const final = within(bills).getByRole("switch", { name: /Tandai final/ }) as HTMLInputElement;
    expect(final.disabled).toBe(true);
    for (const [label, value] of [["Listrik", "18.400"], ["Air", "620"], ["LPG", "310"], ["Sampah", "950,5"]]) fireEvent.change(within(bills).getByLabelText(new RegExp(`^${label}`)), { target: { value } });
    expect(final.disabled).toBe(false);
  });
});
