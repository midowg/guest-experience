import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { RoommateView } from "@/lib/main-wam/peserta/roommate";
import { LangProvider } from "@/components/main-wam/i18n";
import { setActiveLang } from "@/lib/main-wam/i18n";
import { sampleRoom3 } from "@/lib/main-wam/sample";
import { sampleRoommate } from "@/lib/main-wam/sample-roommate";
import { mainWamApi } from "@/lib/routes";
import { RoomScreen } from "./saya/RoomScreen";

/* Kamar: a button per roommate (not me), the profile sheet opening at once with a Skeleton, then the answers. */

const request = vi.hoisted(() => ({ mwRequest: vi.fn() }));
vi.mock("./request", async () => ({ ...(await vi.importActual<typeof import("./request")>("./request")), mwRequest: request.mwRequest }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => "/wam2026" }));
vi.mock("@/components/main-wam/theme/font", () => ({ mainWamFontVars: "" }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
beforeEach(() => { window.history.replaceState(null, "", "/wam2026"); request.mwRequest.mockReset(); });
afterEach(() => { cleanup(); setActiveLang("id"); });

const room = { name: "208", sub: "Lantai 2", note: "", people: sampleRoom3.people };
const [me, sari, dewi] = sampleRoom3.people;
const viewOf = (person: typeof sari, index = 0): RoommateView => sampleRoommate(person, index);
const mount = () => render(<RoomScreen room={room} stay={{ checkIn: "", checkOut: "" }} roomHelp={null} />);

describe("Kamar: teman sekamar", () => {
  it("a button per roommate, none for myself", () => {
    mount();
    expect(screen.getByRole("button", { name: `Lihat profil ${sari.name}` })).toBeTruthy();
    expect(screen.getByRole("button", { name: `Lihat profil ${dewi.name}` })).toBeTruthy();
    expect(screen.queryByRole("button", { name: `Lihat profil ${me.name}` })).toBeNull();
    expect(screen.getAllByRole("button").length).toBe(2);
  });

  it("opens at once with the head and a skeleton, then the answers in question-answer pairs; Esc closes", async () => {
    let finish: (view: RoommateView) => void = () => undefined;
    request.mwRequest.mockReturnValue(new Promise(resolve => { finish = view => resolve({ data: { view }, message: "" }); }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: `Lihat profil ${sari.name}` }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(sari.name)).toBeTruthy();
    expect(within(dialog).getByRole("status", { name: "Memuat profil" })).toBeTruthy();
    expect(request.mwRequest).toHaveBeenCalledWith(mainWamApi.roommate(sari.id));
    finish(viewOf(sari));
    await waitFor(() => expect(within(dialog).queryByRole("status")).toBeNull());
    expect(within(dialog).getByText("Kenalan")).toBeTruthy();
    expect(within(dialog).getByText("Lagu yang selalu bikin kamu semangat?")).toBeTruthy();
    expect(within(dialog).getByText("Contoh Tokoh")).toBeTruthy();
    expect(dialog.querySelectorAll("dt").length).toBe(dialog.querySelectorAll("dd").length);
    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
  });

  it("keeps what it loaded: a second opening does not ask again", async () => {
    request.mwRequest.mockResolvedValue({ data: { view: viewOf(sari) }, message: "" });
    mount();
    fireEvent.click(screen.getByRole("button", { name: `Lihat profil ${sari.name}` }));
    await screen.findByText("Kenalan");
    fireEvent.click(screen.getByRole("button", { name: /^(Tutup|Close)/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: `Lihat profil ${sari.name}` }));
    expect(await screen.findByText("Kenalan")).toBeTruthy();
    expect(request.mwRequest).toHaveBeenCalledTimes(1);
  });

  it("says so when they have not filled in the questionnaire", async () => {
    request.mwRequest.mockResolvedValue({ data: { view: viewOf(dewi, 1) }, message: "" });
    mount();
    fireEvent.click(screen.getByRole("button", { name: `Lihat profil ${dewi.name}` }));
    expect(await screen.findByText("Belum mengisi kuesioner")).toBeTruthy();
    expect(screen.queryByText("Kenalan")).toBeNull();
  });

  it("a failed load: the message and Coba lagi, which asks again", async () => {
    request.mwRequest.mockRejectedValueOnce(new Error("putus")).mockResolvedValueOnce({ data: { view: viewOf(sari) }, message: "" });
    mount();
    fireEvent.click(screen.getByRole("button", { name: `Lihat profil ${sari.name}` }));
    expect(await screen.findByText("Profil belum bisa dimuat")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(await screen.findByText("Kenalan")).toBeTruthy();
    expect(request.mwRequest).toHaveBeenCalledTimes(2);
  });

  it("speaks English too", async () => {
    request.mwRequest.mockResolvedValue({ data: { view: viewOf(dewi, 1) }, message: "" });
    render(<LangProvider lang="en"><RoomScreen room={room} stay={{ checkIn: "", checkOut: "" }} roomHelp={null} /></LangProvider>);
    fireEvent.click(screen.getByRole("button", { name: `View ${dewi.name}'s profile` }));
    expect(await screen.findByText("Has not filled in the questionnaire yet")).toBeTruthy();
  });
});
