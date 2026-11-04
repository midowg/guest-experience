import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, useReducer } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AGENDA_ITEM, type SessionView } from "@/lib/pra-wam/agenda";
import { praWamApi, praWamPath } from "@/lib/routes";
import type { AgendaItem } from "@/lib/server/pra-wam/agenda";
import { AgendaSheet } from "./AgendaSheet";

const refresh = vi.fn();
// The address as Next keeps it: re-read whenever the history changes.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => {
    const [, update] = useReducer((count: number) => count + 1, 0);
    useEffect(() => {
      window.addEventListener("test:url", update);
      window.addEventListener("popstate", update);
      return () => { window.removeEventListener("test:url", update); window.removeEventListener("popstate", update); };
    }, []);
    return new URLSearchParams(window.location.search);
  },
}));

beforeAll(() => {
  // jsdom has no modal dialogs.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  for (const name of ["pushState", "replaceState"] as const) {
    const original = window.history[name].bind(window.history);
    window.history[name] = (...args: Parameters<History["pushState"]>) => { original(...args); window.dispatchEvent(new Event("test:url")); };
  }
});

const fetchMock = vi.fn();
beforeEach(() => {
  window.history.replaceState(null, "", "/wam/agenda?date=2026-11-26");
  refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (data: unknown, message = "") => Promise.resolve(new Response(JSON.stringify({ ok: true, data, message }), { status: 200, headers: { "Content-Type": "application/json" } }));

const person = (id: string, name: string) => ({ id, name, department: "Finance" });
const later = "2099-11-26T08:00:00Z";
const booking = (mine: boolean): AgendaItem => ({
  key: "b-1", kind: "appraisal", startsAt: "2099-11-26T07:00:00Z", endsAt: later, title: "Appraisal tim", tag: "Book ruang", where: "Ruang Cendana",
  sessionId: null, checkedInAt: null, materials: 0,
  booking: { room: "Ruang Cendana", bookedBy: mine ? person("me", "Nadia Putri") : person("x", "Bima Sakti"), mine, participants: [person("p", "Raka")], description: "Bahas target 2027." },
});
const session: AgendaItem = {
  key: "s-1", kind: "sesi", startsAt: "2099-11-26T06:00:00Z", endsAt: later, title: "CSM & prioritas CAPEX", tag: "Forum", where: "Ruang Utama",
  sessionId: "s-1", checkedInAt: null, materials: 2, booking: null,
};
const view: SessionView = {
  kind: "sesi",
  session: {
    id: "s-1", title: "CSM & prioritas CAPEX", kind: "forum", description: "", status: "terbit", planFrom: null, planTo: null,
    startsAt: session.startsAt, endsAt: later, roomId: null, roomName: "Ruang Utama", location: "", participantCount: 12, isParticipant: true, participants: null,
  },
  documents: [], storage: false, attendance: { ready: true, checkedInAt: null }, requests: [], rooms: [],
  viewer: { name: "Nadia Putri", manage: false, staff: false },
};

function Page({ items, cancelsAny = false }: { items: AgendaItem[]; cancelsAny?: boolean }) {
  return <>
    {items.map(item => <a key={item.key} href={`/wam/agenda?item=${item.key}`} {...{ [AGENDA_ITEM]: item.key }}>{item.title}</a>)}
    <AgendaSheet items={items} version="v1" cancelsAny={cancelsAny} bookingOpen />
  </>;
}

const dialog = () => document.querySelector("dialog")!;

describe("an agenda item opens over the page", () => {
  it("opens a booking in place with its detail, and the address keeps it", () => {
    render(<Page items={[booking(true)]} />);
    const link = screen.getByRole("link", { name: "Appraisal tim" });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    act(() => { link.dispatchEvent(click); });
    expect(click.defaultPrevented).toBe(true);
    expect(window.location.pathname + window.location.search).toBe("/wam/agenda?date=2026-11-26&item=b-1");
    expect(dialog().hasAttribute("open")).toBe(true);
    const sheet = within(dialog());
    expect(sheet.getByRole("heading", { name: "Appraisal tim" })).toBeTruthy();
    expect(sheet.getByText("Ruang Cendana")).toBeTruthy();
    expect(sheet.getByText("Kamu")).toBeTruthy();
    expect(sheet.getByText("Raka")).toBeTruthy();
    expect(sheet.getByText("Bahas target 2027.")).toBeTruthy();
    expect(sheet.getByRole("link", { name: "Ubah" }).getAttribute("href")).toBe(praWamPath.bookSheet({ date: "2099-11-26", edit: "b-1" }));
    // One way to take a booking off: Batalkan (no separate permanent delete here).
    expect(sheet.getByRole("button", { name: "Batalkan" })).toBeTruthy();
    expect(sheet.queryByRole("button", { name: "Hapus" })).toBeNull();
    // Only "Ubah" leads to Book, straight into its edit sheet; nothing else leaves the agenda.
    expect([...dialog().querySelectorAll("a")].filter(anchor => anchor.getAttribute("href")?.startsWith(praWamPath.appraisal())).map(anchor => anchor.textContent?.trim())).toEqual(["Ubah"]);
  });

  it("gives a participant of someone else's booking nothing to change", () => {
    window.history.replaceState(null, "", "/wam/agenda?item=b-1");
    render(<Page items={[booking(false)]} />);
    const sheet = within(dialog());
    expect(sheet.getByText("Bima Sakti · Finance")).toBeTruthy();
    expect(sheet.queryByRole("button", { name: "Batalkan" })).toBeNull();
    expect(sheet.queryByRole("link", { name: "Ubah" })).toBeNull();
    expect(dialog().querySelector("footer")).toBeNull();
  });

  it("lets panitia cancel someone else's booking after confirming, then says so and refreshes", async () => {
    window.history.replaceState(null, "", "/wam/agenda?item=b-1");
    fetchMock.mockImplementation(() => ok(null, "Booking dibatalkan. Ruang kembali tersedia."));
    render(<Page items={[booking(false)]} cancelsAny />);
    fireEvent.click(within(dialog()).getByRole("button", { name: "Batalkan" }));
    fireEvent.click(await screen.findByRole("button", { name: "Batalkan booking" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Booking dibatalkan."));
    expect(fetchMock).toHaveBeenCalledWith(praWamApi.bookings("b-1"), expect.objectContaining({ method: "DELETE" }));
    expect(window.location.search).toBe("");
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(dialog().hasAttribute("open")).toBe(false);
  });

  it("does not cancel when the confirmation is declined", async () => {
    window.history.replaceState(null, "", "/wam/agenda?item=b-1");
    render(<Page items={[booking(true)]} />);
    fireEvent.click(within(dialog()).getByRole("button", { name: "Batalkan" }));
    // The confirmation names the booking, its time and its room.
    expect(await screen.findByText(/^"Appraisal tim", .* \d{2}\.\d{2}–\d{2}\.\d{2}, Ruang Cendana\. Ruang langsung bisa dipesan orang lain\.$/)).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Batal" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dialog().hasAttribute("open")).toBe(true);
  });

  it("shows a session's skeleton, then Detail sesi from its API", async () => {
    let answer!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>(resolve => { answer = resolve; }));
    render(<Page items={[session]} />);
    act(() => { screen.getByRole("link", { name: "CSM & prioritas CAPEX" }).click(); });
    expect(within(dialog()).getByLabelText("Memuat rincian sesi")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(praWamApi.sessionDetail("s-1"), expect.anything());
    await act(async () => { answer(await ok(view)); });
    const sheet = within(dialog());
    expect(await sheet.findByText("Ruang Utama")).toBeTruthy();
    expect(sheet.getByText("12 orang, termasuk kamu")).toBeTruthy();
    expect(sheet.queryByLabelText("Memuat rincian sesi")).toBeNull();
    expect(sheet.getByRole("link", { name: /Scan QR untuk absen/ })).toBeTruthy();
  });

  it("closes with X and takes the item out of the address", async () => {
    window.history.replaceState(null, "", "/wam/agenda?date=2026-11-26&item=b-1");
    render(<Page items={[booking(true)]} />);
    fireEvent.click(within(dialog()).getByRole("button", { name: "Tutup" }));
    expect(window.location.search).toBe("?date=2026-11-26");
    expect(dialog().hasAttribute("open")).toBe(false);
  });

  it("goes back over the entry it added when closed after a tap", async () => {
    render(<Page items={[booking(true)]} />);
    const before = window.history.length;
    act(() => { screen.getByRole("link", { name: "Appraisal tim" }).click(); });
    expect(window.history.length).toBe(before + 1);
    fireEvent.click(within(dialog()).getByRole("button", { name: "Tutup" }));
    await waitFor(() => expect(window.location.search).toBe("?date=2026-11-26"));
    await waitFor(() => expect(dialog().hasAttribute("open")).toBe(false));
  });
});
