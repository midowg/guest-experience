import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@/components/main-wam/ui";
import { draftKey } from "@/lib/main-wam/modul/silent";
import { at, sampleNominees, sampleSilentView } from "@/lib/main-wam/modul/sample";
import { sampleAwards } from "@/lib/main-wam/sample";
import { mainWamApi, mainWamPath } from "@/lib/routes";
import { NomineePicker } from "./awards/NomineePicker";
import { AbsenView, ModuleActionView } from "./SessionViews";
import { SilentForm } from "./silent/SilentForm";

/* Kirim masukan (T01 → T02, T01-buang, T01-ditutup) and Pilih nominasi (V02 → V01), as a person uses them. */

const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/wam2026" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let answer: (call: Call) => { status: number; body: unknown } = () => ({ status: 200, body: { ok: true, data: null, message: "" } });

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  window.scrollTo = () => undefined;
});
beforeEach(() => {
  calls = [];
  window.localStorage.clear();
  window.history.replaceState(null, "", "/wam2026/silent-meeting");
  Object.values(router).forEach(fn => fn.mockReset());
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const call = { url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const { status, body } = answer(call);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const view = sampleSilentView("buka");
const renderForm = (remaining = 10) => render(<ToastProvider><SilentForm view={view} remaining={remaining} /></ToastProvider>);

describe("Kirim masukan (Silent Meeting)", () => {
  it("keeps Kirim off while empty, sends the text and topic without a name, and shows Masukan terkirim", async () => {
    answer = () => ({ status: 200, body: { ok: true, data: { remaining: 9 }, message: "Masukan terkirim." } });
    renderForm();
    // Opening the form is told on its own, with the question only (the threshold's 5 people, audit H1).
    await waitFor(() => expect(calls).toEqual([{ url: mainWamApi.silent, method: "POST", body: { questionId: view.question.id } }]));
    calls = [];
    expect(screen.getByText("Dibuka · sampai 15.00")).toBeTruthy();
    const send = screen.getByRole("button", { name: "Kirim" });
    expect(send).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Cara kerja" }));
    fireEvent.change(screen.getByLabelText("Masukanmu"), { target: { value: "Rapat mingguan terlalu panjang." } });
    expect(window.localStorage.getItem(draftKey(view.question.id))).toContain("Rapat mingguan");
    expect(send).toHaveProperty("disabled", false);
    fireEvent.click(send);
    await screen.findByRole("heading", { name: "Masukan terkirim" });
    expect(calls).toEqual([{ url: mainWamApi.silentFeedback, method: "POST", body: { questionId: view.question.id, topic: "Cara kerja", body: "Rapat mingguan terlalu panjang." } }]);
    expect(JSON.stringify(calls[0].body)).not.toMatch(/employee|name|nama/i);
    // The phone forgets the text once it is sent; Tulis lagi opens an empty form.
    expect(window.localStorage.getItem(draftKey(view.question.id))).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tulis lagi" }));
    expect((screen.getByLabelText("Masukanmu") as HTMLTextAreaElement).value).toBe("");
  });

  it("asks before throwing the text away on Back (T01-buang), and keeps it on Lanjut", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Masukanmu"), { target: { value: "Setengah jadi" } });
    fireEvent.click(screen.getByRole("button", { name: "Kembali" }));
    const dialog = screen.getByRole("alertdialog", { name: "Buang tulisanmu?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lanjut" }));
    expect((screen.getByLabelText("Masukanmu") as HTMLTextAreaElement).value).toBe("Setengah jadi");
    expect(router.back).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Kembali" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Buang tulisanmu?" })).getByRole("button", { name: "Buang" }));
    expect(window.localStorage.getItem(draftKey(view.question.id))).toBeNull();
    expect(router.back.mock.calls.length + router.push.mock.calls.length).toBe(1);
  });

  it("keeps the text when it closed while writing (T01-ditutup) and says so", async () => {
    answer = () => ({ status: 409, body: { ok: false, message: "Silent Meeting sudah ditutup. Tulisanmu tetap di HP ini." } });
    renderForm();
    fireEvent.change(screen.getByLabelText("Masukanmu"), { target: { value: "Terlambat sedikit" } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Sudah ditutup" });
    expect(dialog.textContent).toContain("Masukanmu belum terkirim.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Tutup" }));
    expect((screen.getByLabelText("Masukanmu") as HTMLTextAreaElement).value).toBe("Terlambat sedikit");
    expect(window.localStorage.getItem(draftKey(view.question.id))).toContain("Terlambat sedikit");
    expect(screen.getByRole("button", { name: "Kirim" })).toHaveProperty("disabled", true);
  });

  it("brings back a draft written earlier on this phone", async () => {
    window.localStorage.setItem(draftKey(view.question.id), JSON.stringify({ topic: "Komunikasi", body: "Draf kemarin" }));
    renderForm();
    await waitFor(() => expect((screen.getByLabelText("Masukanmu") as HTMLTextAreaElement).value).toBe("Draf kemarin"));
    expect(screen.getByRole("button", { name: "Komunikasi" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("stops at the limit per person", () => {
    renderForm(0);
    fireEvent.change(screen.getByLabelText("Masukanmu"), { target: { value: "Lagi" } });
    expect(screen.getByRole("button", { name: "Kirim" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Sudah banyak terkirim. Tunggu beberapa menit untuk mengirim lagi.")).toBeTruthy();
  });
});

describe("Pilih nominasi (Awarding)", () => {
  const category = sampleAwards[0];
  const nominees = category.nominees.map(nominee => sampleNominees()[nominee.id]);
  const renderPicker = (current: string | null = null) => render(<ToastProvider>
    <NomineePicker now={at("2027-01-06", "10:01")} current={current} nominees={nominees}
      category={{ id: category.id, title: category.title, description: category.description, closesAt: category.closesAt! }} />
  </ToastProvider>);

  it("needs one choice, sends it, and goes back to Awarding with Pilihanmu terkirim", async () => {
    answer = () => ({ status: 200, body: { ok: true, data: {}, message: "Pilihanmu terkirim." } });
    renderPicker();
    expect(screen.getByText("Rahasia. Bisa diubah sampai 15.00.")).toBeTruthy();
    const send = screen.getByRole("button", { name: "Kirim" });
    expect(send).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("radio", { name: /Bima/ }));
    expect(send).toHaveProperty("disabled", false);
    fireEvent.click(send);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(mainWamPath.awards));
    expect(calls).toEqual([{ url: mainWamApi.vote(category.id), method: "PUT", body: { nomineeId: category.nominees[1].id } }]);
    expect(await screen.findByText("Pilihanmu terkirim.")).toBeTruthy();
  });

  it("starts at the person's own vote and sends only a change", () => {
    renderPicker(category.nominees[0].id);
    expect((screen.getByRole("radio", { name: /Sari/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("button", { name: "Kirim" })).toHaveProperty("disabled", true);
  });

  it("shows the server's refusal and stays", async () => {
    answer = () => ({ status: 409, body: { ok: false, message: "Voting sudah ditutup." } });
    renderPicker();
    fireEvent.click(screen.getByRole("radio", { name: /Nina/ }));
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    expect(await screen.findByText("Voting sudah ditutup.")).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("Detail sesi slots", () => {
  it("draws one Absen button while open, the time once present, and nothing otherwise", () => {
    const { container, rerender } = render(<ToastProvider><AbsenView slot={{ kind: "buka", closes: "2027-01-05T05:30:00Z" }} /></ToastProvider>);
    const button = screen.getByRole("link", { name: "Absen" });
    expect(button.getAttribute("href")).toBe(mainWamPath.scan);
    expect(container.querySelectorAll("a, button")).toHaveLength(1);
    rerender(<ToastProvider><AbsenView slot={{ kind: "hadir", at: "2027-01-05T00:52:00Z" }} /></ToastProvider>);
    expect(screen.getByText("Hadir 07.52")).toBeTruthy();
    rerender(<ToastProvider><AbsenView slot={{ kind: "none" }} /></ToastProvider>);
    expect(container.textContent).toBe("");
    rerender(<ToastProvider><ModuleActionView slot={{ action: null, qr: null }} /></ToastProvider>);
    expect(container.textContent).toBe("");
  });

  it("while the QR check-in is hidden: one calm line about the tablet, no button, no link", () => {
    const { container } = render(<ToastProvider><AbsenView slot={{ kind: "tablet" }} /></ToastProvider>);
    expect(screen.getByText("Absen lewat scan wajah di tablet pintu ruang")).toBeTruthy();
    expect(container.querySelectorAll("a, button")).toHaveLength(0);
    expect(container.textContent).not.toMatch(/QR|scan QR|Absen sekarang/i);
  });

  it("offers Kirim masukan with when it closes", () => {
    render(<ToastProvider><ModuleActionView slot={{ action: { kind: "silent-buka", href: mainWamPath.silentMeeting("s"), closesAt: "2027-01-05T08:00:00Z" }, qr: null }} /></ToastProvider>);
    expect(screen.getByText("Tanpa nama · sampai 15.00")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Kirim masukan" }).getAttribute("href")).toBe(mainWamPath.silentMeeting("s"));
  });
});

