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
/** The label of the room tapped: its lines, or null when none shows. */
const tip = (container: HTMLElement) => {
  const card = container.querySelector("[class*='tipCard']");
  return card ? [...card.children].map(node => node.textContent) : null;
};

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

  it("keeps each room's box to its chairs: name, specification and status are in the label of the room tapped", () => {
    const { container } = render(<FloorPlan rooms={rooms} statusOf={() => free} label="Denah kantor" />);
    // What the plan shows inside its boxes: no names, no "Ruang N", no chairs count, no status.
    const text = () => [...container.querySelectorAll("svg text")].map(node => node.textContent).join(" ");
    for (const word of ["Nagapadma", "Vasuki", "kursi", "Kapasitas", "Kosong", "Ruang 5"]) expect(text()).not.toContain(word);
    expect(tip(container)).toBeNull();
    // Each room is still named for screen readers, with its specification and status.
    const nagapadma = screen.getByRole("button", { name: /^Nagapadma, Muat 8 orang · TV, Whiteboard, kosong 09.00–10.00/ });
    expect(nagapadma.querySelector("title")?.textContent).toContain("TV, Whiteboard");
    // A tap shows the label: the name, then people, facilities and status.
    fireEvent.click(nagapadma);
    expect(tip(container)).toEqual(["Nagapadma", "8 orang · TV · Whiteboard", "Kosong 09.00–10.00"]);
    // A tap on the floor, away from any room, closes it.
    fireEvent.click(plan());
    expect(tip(container)).toBeNull();
  });

  it("draws each room's chairs from its capacity, below its name", () => {
    const { container } = render(<FloorPlan rooms={rooms} statusOf={() => free} label="Denah kantor" />);
    const seats = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name},`) }).querySelector("path[class*='seat']")?.getAttribute("d")?.match(/M/g)?.length ?? 0;
    expect(seats("Nagapadma")).toBe(8);
    expect(seats("Vasuki")).toBe(4);
    // No capacity: a table without chairs.
    expect(seats("Antareja")).toBe(0);
    // Communal Space has no room here, yet keeps its sofas and coffee table; plants stand in the corridor.
    expect(container.querySelectorAll("rect[class*='sofa']")).toHaveLength(2);
    expect(container.querySelectorAll("circle[class*='plant']").length).toBeGreaterThan(0);
    // The chairs are never read out on their own.
    expect(container.querySelector("[class*='furniture']")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("rings the chosen room with its label; a taken room is faded and cannot be tapped", () => {
    const statusOf = (item: Room): PlanStatus => item.name === "Nagapadma" ? { tone: "busy", text: "Terpakai 09.30–11.00" } : free;
    const onPick = vi.fn();
    const { container, rerender } = render(<FloorPlan rooms={rooms} statusOf={statusOf} label="Denah kantor" onPick={onPick} selectedId="vasuki" />);
    const label = () => tip(container);
    expect(container.querySelector("[class*='focus']")?.getAttribute("aria-hidden")).toBe("true");
    expect(label()).toEqual(["Vasuki", "4 orang · min 1", "Kosong 09.00–10.00"]);
    rerender(<FloorPlan rooms={rooms} statusOf={statusOf} label="Denah kantor" onPick={onPick} highlightId="antareja" />);
    expect(label()).toEqual(["Antareja", "Kapasitas belum diisi", "Kosong 09.00–10.00"]);
    // A room that cannot be picked is faded, not a button, and has no "Terpakai" tag in its box.
    const nagapadma = screen.getByRole("img", { name: /^Nagapadma, .*terpakai 09.30–11.00$/ });
    expect(nagapadma.getAttribute("class")).toMatch(/inactive/);
    expect(nagapadma.querySelectorAll("text")).toHaveLength(0);
    fireEvent.click(nagapadma);
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Vasuki,/ }).getAttribute("class")).toMatch(/active/);
  });

  it("puts the action in the label, and runs it", () => {
    const run = vi.fn();
    const { container } = render(<FloorPlan rooms={rooms} statusOf={() => free} label="Denah kantor"
      tipAction={item => item.name === "Vasuki" ? { label: "Book ruang ini", run } : null} />);
    fireEvent.click(screen.getByRole("button", { name: /^Nagapadma,/ }));
    expect(screen.queryByRole("button", { name: "Book ruang ini" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Vasuki,/ }));
    fireEvent.click(screen.getByRole("button", { name: "Book ruang ini" }));
    expect(run).toHaveBeenCalled();
    expect(tip(container)?.[0]).toBe("Vasuki");
  });

  it("colours chairs by main or small room in the admin's view, as the room list groups them", () => {
    const mixed = [room("Nagapadma", { capacity: 8 }), room("Antareja", { capacity: 4 }), room("Pantry", { kind: "area", capacity: 4 })];
    render(<FloorPlan rooms={mixed} statusOf={() => free} label="Denah kantor" onPickSpot={() => {}} selectedSpot="nagapadma" />);
    const legend = screen.getByRole("list", { name: "Keterangan warna" }).textContent;
    expect(legend).toContain("Ruang utama");
    expect(legend).toContain("Ruang kecil");
    expect(screen.getByRole("button", { name: /^Nagapadma/ }).getAttribute("class")).toMatch(/kindMain/);
    // A main room for at most 4 people is a small room; an area is not.
    expect(screen.getByRole("button", { name: /^Antareja/ }).getAttribute("class")).toMatch(/kindSmall/);
    expect(screen.getByRole("button", { name: /^Pantry/ }).getAttribute("class")).toMatch(/kindMain/);
  });

  it("shows a compass with north up, toward Limasan", () => {
    render(<FloorPlan rooms={rooms} statusOf={() => free} label="Denah kantor" />);
    expect(screen.getByRole("img", { name: /Kompas: utara ke atas, sisi Limasan/ })).toBeTruthy();
  });

  it("draws the site and Vasuki's divider, and no “Ruang N” on the people's plan", () => {
    const { container } = render(<FloorPlan rooms={rooms} statusOf={() => free} label="Denah kantor" />);
    const site = container.querySelector("g[class*='site']")!;
    expect(site.getAttribute("aria-hidden")).toBe("true");
    expect(site.querySelectorAll("rect").length).toBeGreaterThan(20);
    expect(site.textContent).toBe("Masuk");
    const vasuki = screen.getByRole("button", { name: /^Vasuki,/ });
    expect(vasuki.querySelector("line[class*='divider']")).toBeTruthy();
    // The numbered rooms are plain boxes: no name drawn, nothing read out.
    const svgText = () => [...container.querySelectorAll("svg text")].map(node => node.textContent);
    expect(svgText().some(text => text?.startsWith("Ruang"))).toBe(false);
    expect(screen.queryByRole("img", { name: /Ruang 5/ })).toBeNull();
    // A room's spot with no WAM room (Pantry) still says what it is when tapped.
    fireEvent.click(screen.getByRole("button", { name: "Pantry, bukan ruang booking" }));
    expect(tip(container)).toEqual(["Pantry", "Bukan ruang booking"]);
    // Main Office keeps its desks as fixtures, with no table of its own.
    expect(container.querySelectorAll("rect[class*='desk']")).toHaveLength(10);
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

  it("lets the super admin pick empty spots, each named Ruang N", () => {
    const onPickSpot = vi.fn();
    const { container } = render(<FloorPlan rooms={rooms} statusOf={() => free} label="Denah kantor" onPickSpot={onPickSpot}
      emptySpot={{ tone: "closed", text: "Spot kosong" }} />);
    expect(container.textContent).not.toMatch(/Pak Bagus|Pak Fadil|Comms/);
    expect(screen.getAllByText("Spot kosong").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Ruang 5, spot kosong. Ubah spot ini" }));
    expect(onPickSpot).toHaveBeenCalledWith("ruang-5");
    fireEvent.click(screen.getByRole("button", { name: "Pantry, spot kosong. Ubah spot ini" }));
    expect(onPickSpot).toHaveBeenLastCalledWith("pantry");
  });
});
