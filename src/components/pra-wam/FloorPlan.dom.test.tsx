import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Room } from "@/lib/pra-wam/appraisal";
import { PLAN_H, PLAN_W, type PlanStatus } from "@/lib/pra-wam/floor-plan";
import { FloorPlan } from "./FloorPlan";

afterEach(cleanup);
beforeAll(() => {
  // jsdom has no PointerEvent: a MouseEvent with a pointer id and type is enough here.
  if (!("PointerEvent" in window)) {
    class PointerEvent extends MouseEvent {
      pointerId: number; pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; this.pointerType = init.pointerType ?? "mouse"; }
    }
    Object.assign(window, { PointerEvent });
  }
});

const room = (name: string, extra: Partial<Room> = {}): Room => ({
  id: name.toLowerCase(), slug: name.toLowerCase(), name, kind: "utama", capacity: null, bookable: true, minPeople: null, planKey: null, facilities: [], ...extra,
});
const rooms = [
  room("Nagapadma", { capacity: 8, facilities: ["TV", "Whiteboard"] }),
  room("Vasuki", { capacity: 4, minPeople: 1 }),
  room("Antareja"),
];
const free: PlanStatus = { tone: "free", text: "Kosong 09.00–10.00" };
const plan = () => screen.getByRole("group", { name: "Denah kantor" });
const viewBox = () => plan().querySelector("svg")?.getAttribute("viewBox");
const fit = `0.00 0.00 ${PLAN_W.toFixed(2)} ${PLAN_H.toFixed(2)}`;

describe("FloorPlan", () => {
  it("opens fitted, with the zoom buttons inside the plan and no names of desks", () => {
    const { container } = render(<FloorPlan rooms={rooms} statusOf={() => free} label="Denah kantor" caption="Ketuk ruang yang kosong." />);
    expect(viewBox()).toBe(fit);
    expect(screen.queryByText(/Lihat seluruh denah|Geser denah/)).toBeNull();
    for (const name of ["Perbesar denah", "Perkecil denah", "Pas layar"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    const text = container.textContent ?? "";
    for (const name of ["Pak Bagus", "Pak Fadil", "Comms", "Bukan ruang booking", "Spot kosong"]) expect(text).not.toContain(name);
    // The caption sits below the plan.
    const caption = screen.getByText("Ketuk ruang yang kosong.");
    expect(plan().compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows each room's specification under its name, and the status when asked", () => {
    const { container, rerender } = render(<FloorPlan rooms={rooms} statusOf={() => free} label="Denah kantor" />);
    // What the plan shows, not its tooltips.
    const text = () => [...container.querySelectorAll("svg text")].map(node => node.textContent).join(" ");
    expect(text()).toMatch(/Maks 4( ·)? min 1/);
    expect(text()).toContain("Kapasitas belum diisi");
    expect(text()).not.toContain("Kosong 09.00–10.00");
    rerender(<FloorPlan rooms={rooms} statusOf={() => free} label="Denah kantor" subtitle="status" />);
    expect(text()).toContain("Kosong 09.00–10.00");
    // The status is still read out.
    expect(screen.getByRole("img", { name: "Nagapadma, kosong 09.00–10.00" })).toBeTruthy();
    // Nagapadma's narrow box shows its specification once zoomed in.
    rerender(<FloorPlan rooms={rooms} statusOf={() => free} label="Denah kantor" />);
    expect(text()).not.toContain("Maks 8 orang");
    const zoomIn = screen.getByRole("button", { name: "Perbesar denah" });
    fireEvent.click(zoomIn); fireEvent.click(zoomIn); fireEvent.click(zoomIn);
    expect(text()).toContain("Maks 8 orang");
    expect(text()).toContain("TV, Whiteboard");
  });

  it("shows a compass with north up, toward Limasan", () => {
    render(<FloorPlan rooms={rooms} statusOf={() => free} label="Denah kantor" />);
    expect(screen.getByRole("img", { name: /Kompas: utara ke atas, sisi Limasan/ })).toBeTruthy();
  });

  it("zooms with the buttons and the keyboard, between 1× and 4×", () => {
    render(<FloorPlan rooms={rooms} statusOf={() => free} label="Denah kantor" />);
    const zoomIn = screen.getByRole("button", { name: "Perbesar denah" });
    expect(screen.getByRole("button", { name: "Perkecil denah" }).getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(zoomIn);
    expect(viewBox()).not.toBe(fit);
    expect(screen.getByRole("status").textContent).toMatch(/Denah diperbesar 1,6×/);
    fireEvent.click(zoomIn); fireEvent.click(zoomIn); fireEvent.click(zoomIn);
    expect(viewBox()?.split(" ")[2]).toBe((PLAN_W / 4).toFixed(2));
    expect(zoomIn.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Pas layar" }));
    expect(viewBox()).toBe(fit);
    fireEvent.keyDown(plan(), { key: "+" });
    expect(viewBox()).not.toBe(fit);
    fireEvent.keyDown(plan(), { key: "0" });
    expect(viewBox()).toBe(fit);
  });

  it("picks a room on a tap, but not after a drag", () => {
    const onPick = vi.fn();
    render(<FloorPlan rooms={rooms} statusOf={() => free} onPick={onPick} label="Denah kantor" />);
    const nagapadma = screen.getByRole("button", { name: /^Nagapadma/ });
    fireEvent.pointerDown(nagapadma, { pointerId: 1, clientX: 100, clientY: 100, button: 0, pointerType: "mouse" });
    fireEvent.pointerMove(nagapadma, { pointerId: 1, clientX: 160, clientY: 100, pointerType: "mouse" });
    fireEvent.pointerUp(nagapadma, { pointerId: 1, clientX: 160, clientY: 100, pointerType: "mouse" });
    fireEvent.click(nagapadma);
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.pointerDown(nagapadma, { pointerId: 2, clientX: 100, clientY: 100, button: 0, pointerType: "mouse" });
    fireEvent.pointerUp(nagapadma, { pointerId: 2, clientX: 102, clientY: 101, pointerType: "mouse" });
    fireEvent.click(nagapadma);
    expect(onPick).toHaveBeenCalledWith(rooms[0]);
  });

  it("lets the super admin pick empty spots, named without whose desk they were", () => {
    const onPickSpot = vi.fn();
    const { container } = render(<FloorPlan rooms={rooms} statusOf={() => free} label="Denah kantor" onPickSpot={onPickSpot}
      emptySpot={{ tone: "closed", text: "Spot kosong" }} />);
    expect(container.textContent).not.toMatch(/Pak Bagus|Pak Fadil|Comms/);
    expect(screen.getAllByText("Spot kosong").length).toBeGreaterThan(0);
    const spots = screen.getAllByRole("button", { name: "Spot kosong. Ubah spot ini" });
    fireEvent.click(spots[0]);
    expect(onPickSpot).toHaveBeenCalledWith("pak-bagus");
  });
});
