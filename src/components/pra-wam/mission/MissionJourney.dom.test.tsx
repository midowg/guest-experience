import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MissionView } from "@/lib/pra-wam/mission";
import { MissionJourney } from "./MissionJourney";

afterEach(cleanup);
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
vi.mock("../ConfirmDialog", () => ({ useConfirm: () => [async () => true, null] }));

/* Misi Perjalanan's "Sudah tiba?" (rapat HoD BoD, 24 Nov 2026): one button, no field to fill (made-up person). */
const view: MissionView = { employeeId: "dev-hod", name: "Rani Contoh", nick: "Rani", role: "HoD", ceo: false, sentences: [6], room: null };

describe("Misi Perjalanan: Sudah tiba", () => {
  it("asks nothing more (no kaos size or other change), only Ya, saya sudah tiba", async () => {
    window.scrollTo = () => {};
    render(<MissionJourney view={view} detailHref="#" />);
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: /Sudah tiba di venue/ })); });
    expect(await screen.findByRole("button", { name: "Ya, saya sudah tiba" })).toBeTruthy();
    expect(screen.queryByText(/Ada yang berubah/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/kaos/i);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });
});

describe("Misi Perjalanan: BoD", () => {
  it("shows only the questions per session: no road, missions, quiz or Sudah tiba", async () => {
    render(<MissionJourney view={{ ...view, employeeId: "dev-bod", role: "BoD", ceo: true, sentences: [1] }} detailHref="#" />);
    expect(await screen.findByRole("heading", { name: "Pertanyaan per sesi" })).toBeTruthy();
    expect(screen.queryByText(/Misi di perjalanan|Susun Kalimatmu|Siapa teman sekamarmu/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Sudah tiba di venue/ })).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Business Overview & Evaluation/ })); });
    expect(await screen.findByRole("button", { name: "Buka Mode CEO" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Kirim pertanyaan" })).toBeNull();
  });
});
