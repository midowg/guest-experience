import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { sampleAdminGroups, sampleAdminGuides, sampleAdminLog, sampleAdminPeople, sampleAdminSessions, sampleAdminSettings } from "@/lib/main-wam/admin/sample";
import { samplePeople, sampleSessionIds } from "@/lib/main-wam/sample";
import { eventDates } from "@/lib/main-wam/rundown";
import { mainWamAdminApi } from "@/lib/routes";

const request = vi.fn();
vi.mock("@/components/admin/shared/api", async importOriginal => ({ ...(await importOriginal<object>()), adminRequest: (...args: unknown[]) => request(...args) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode; scroll?: boolean }) => { delete props.scroll; return <a href={href} {...props}>{children}</a>; } }));
const { RundownEditor } = await import("./RundownEditor");
const { GroupsEditor } = await import("./GroupsEditor");
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

  it("says plainly when the rundown waits for the system update, and locks adding", () => {
    rundown({ initial: [], migrated: false });
    expect(screen.getByText(/menunggu pembaruan sistem/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Tambah sesi" }) as HTMLButtonElement).disabled).toBe(true);
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

describe("Kelompok", () => {
  it("flags who has no kelompok and asks before publishing", async () => {
    request.mockResolvedValue({ message: "Kelompok diterbitkan. Peserta sekarang melihat kelompoknya.", data: { ...sampleAdminSettings(), groupsPublished: true } });
    render(<GroupsEditor initial={sampleAdminGroups} migrated people={sampleAdminPeople} published={false} crumbs={[]} title="Main WAM · Kelompok" />);
    const flagged = screen.getByRole("region", { name: "Belum punya kelompok" });
    expect(flagged.textContent).toContain(samplePeople.arman.fullName);
    expect(flagged.textContent).not.toContain(samplePeople.rani.fullName);
    fireEvent.click(screen.getByRole("button", { name: "Terbitkan" }));
    expect(request).not.toHaveBeenCalled();
    // The confirmation's own "Terbitkan" (the dialog opens after the page's button).
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Terbitkan" })).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("button", { name: "Terbitkan" })[1]);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0][0]).toBe(mainWamAdminApi.eventInfo);
    expect(JSON.parse((request.mock.calls[0][1] as { body: string }).body)).toEqual({ groupsPublished: true });
    expect(await screen.findByText("Terbit")).toBeTruthy();
  });

  it("saves a kelompok's members and koordinator as a whole; moving someone is said", async () => {
    request.mockResolvedValue({ message: "ok", data: { groups: sampleAdminGroups } });
    render(<GroupsEditor initial={sampleAdminGroups} migrated people={sampleAdminPeople} published crumbs={[]} title="Main WAM · Kelompok" />);
    fireEvent.click(screen.getByRole("button", { name: "Ubah Kelompok 2 · Kawi" }));
    const sheet = screen.getByRole("dialog", { name: "Ubah kelompok" });
    fireEvent.click(within(sheet).getByRole("checkbox", { name: /Rani Contoh/ }));
    expect(within(sheet).getByText("Pindah dari Kelompok 4 · Arjuno")).toBeTruthy();
    fireEvent.change(within(sheet).getByLabelText(/Koordinator/), { target: { value: samplePeople.rani.id } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0][0]).toBe(mainWamAdminApi.groupMembers(sampleAdminGroups[1].id));
    expect(JSON.parse((request.mock.calls[0][1] as { body: string }).body)).toEqual({ employeeIds: [samplePeople.dimas.id, samplePeople.rani.id], coordinatorId: samplePeople.rani.id });
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

  it("lets the hotel bills be final only with all four", () => {
    render(<EventInfoEditor initial={sampleAdminSettings()} people={sampleAdminPeople} crumbs={[]} title="Main WAM · Info acara" />);
    const bills = screen.getByRole("region", { name: "Tagihan hotel" });
    const final = within(bills).getByRole("switch", { name: /Tandai final/ }) as HTMLInputElement;
    expect(final.disabled).toBe(true);
    for (const [label, value] of [["Listrik", "18.400"], ["Air", "620"], ["LPG", "310"], ["Sampah", "950,5"]]) fireEvent.change(within(bills).getByLabelText(new RegExp(`^${label}`)), { target: { value } });
    expect(final.disabled).toBe(false);
  });
});
