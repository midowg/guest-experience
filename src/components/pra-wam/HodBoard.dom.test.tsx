import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { HodMeeting } from "@/lib/pra-wam/hod";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));
const request = vi.fn(async (...args: unknown[]) => { void args; return { data: null, message: "Kamu menerima. Menunggu HOD lain." }; });
vi.mock("./api", () => ({ praWamRequest: (...args: unknown[]) => request(...args), errorText: () => "Gagal." }));

import { HodBoard } from "./HodBoard";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); request.mockClear(); });

const meeting: HodMeeting = {
  id: "0b7c2d1e-0000-4000-8000-000000000001", title: "Sinkronisasi target", agenda: "Target Q1", place: "Nagapadma", status: "menunggu",
  startsAt: "2026-11-10T03:00:00Z", endsAt: "2026-11-10T04:00:00Z", createdAt: "2026-11-06T00:00:00Z", roomId: null, roomBooked: false,
  requester: { id: "a", name: "Ana", unit: "HC" },
  invites: [
    { id: "me", name: "Saya", unit: "IT", response: "menunggu", note: "", respondedAt: null },
    { id: "b", name: "Budi", unit: "Finance", response: "terima", note: "", respondedAt: "2026-11-06T01:00:00Z" },
  ],
};
const departments = [
  { id: "u-it", name: "IT", heads: [{ id: "me", name: "Saya" }] },
  { id: "u-fin", name: "Finance", heads: [{ id: "b", name: "Budi" }] },
  { id: "u-ops", name: "Operasional", heads: [] },
];

describe("Meeting HOD", () => {
  it("asks for my answer first, and sends it", async () => {
    render(<HodBoard meetings={[meeting]} departments={departments} viewerId="me" ownUnits={["u-it"]} migrated now="2026-11-06T02:00:00Z" />);
    expect(screen.getByText("Perlu jawabanmu")).toBeTruthy();
    const card = within(screen.getByRole("article", { name: "Sinkronisasi target" }));
    expect(card.getByText("1 dari 2 menerima")).toBeTruthy();
    fireEvent.click(card.getByRole("button", { name: /Terima/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(`/api/wam/hod/${meeting.id}`, { method: "POST", json: { accept: true, note: "" } }));
    expect(await screen.findByText("Kamu menerima. Menunggu HOD lain.")).toBeTruthy();
  });

  it("declines with a reason", async () => {
    render(<HodBoard meetings={[meeting]} departments={departments} viewerId="me" ownUnits={["u-it"]} migrated now="2026-11-06T02:00:00Z" />);
    const card = within(screen.getByRole("article", { name: "Sinkronisasi target" }));
    fireEvent.click(card.getByRole("button", { name: "Tolak" }));
    fireEvent.change(card.getByLabelText(/Alasan menolak/), { target: { value: "Bentrok" } });
    fireEvent.click(card.getByRole("button", { name: "Kirim penolakan" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(`/api/wam/hod/${meeting.id}`, { method: "POST", json: { accept: false, note: "Bentrok" } }));
  });

  it("asks as Book ruang does: the day, start and length, a room, and the departments picked", async () => {
    const rooms = [
      { id: "r1", slug: "nagapadma", name: "Nagapadma", kind: "utama" as const, capacity: 10, bookable: true, minPeople: null, planKey: null, facilities: [] },
      { id: "r2", slug: "vasuki", name: "Vasuki", kind: "utama" as const, capacity: 30, bookable: true, minPeople: null, planKey: null, facilities: [] },
    ];
    const taken = { id: "b1", roomId: "r2", title: "Rapat", description: "", startsAt: "2026-11-09T03:00:00Z", endsAt: "2026-11-09T05:00:00Z", isSession: false, bookedBy: { id: "x", name: "X", department: "" } } as never;
    render(<HodBoard meetings={[]} departments={departments} viewerId="me" ownUnits={["u-it"]} migrated now="2026-11-06T02:00:00Z" rooms={rooms} bookings={[taken]} />);
    expect(screen.getByText("Belum ada meeting HOD yang akan datang.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Ajukan meeting/ }));
    const form = within(screen.getByRole("dialog", { name: "Ajukan meeting HOD" }));
    expect(form.queryByRole("checkbox", { name: /IT/ })).toBeNull();
    expect((form.getByRole("checkbox", { name: /Operasional/ }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(form.getByRole("button", { name: "Kirim undangan" }));
    expect(form.getByText("Tulis judul meeting.")).toBeTruthy();
    fireEvent.change(form.getByLabelText("Judul"), { target: { value: "Rencana 2027" } });
    // Start and length as in Book ruang; the line under them says the day and hours.
    expect(form.getByLabelText("Jam mulai")).toBeTruthy();
    expect(form.getByLabelText("Durasi")).toBeTruthy();
    fireEvent.click(form.getByRole("checkbox", { name: /Finance/ }));
    fireEvent.click(form.getByRole("button", { name: "Kirim undangan" }));
    expect(form.getByText("Pilih tempat meeting.")).toBeTruthy();
    // The place is picked from the rooms; another place can be typed.
    const place = form.getByLabelText("Tempat") as HTMLSelectElement;
    expect([...place.options].map(option => option.textContent)).toEqual(["Pilih ruangan", "Nagapadma · 10 orang", "Vasuki · 30 orang", "Lainnya (online atau tempat lain)"]);
    fireEvent.change(place, { target: { value: "r1" } });
    fireEvent.click(form.getByRole("button", { name: "Kirim undangan" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/wam/hod", expect.objectContaining({ method: "POST", json: expect.objectContaining({ title: "Rencana 2027", place: "Nagapadma", roomId: "r1", unitIds: ["u-fin"] }) })));
  });
});
