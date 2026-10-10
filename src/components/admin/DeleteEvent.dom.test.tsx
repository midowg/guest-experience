import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DeleteEvent } from "./DeleteEvent";
import { createSeedEvent } from "@/lib/seed-event";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

const event = { ...createSeedEvent(), slug: "rapat-panitia-nyepi-1949" };

beforeEach(() => {
  replace.mockClear(); refresh.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { slug: event.slug, rsvps: 3, feedback: 1 }, message: "Acara dihapus." }), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const openConfirm = () => fireEvent.click(screen.getByRole("button", { name: /Hapus acara ini/ }));
const confirmField = () => document.querySelector("#delete-confirm") as HTMLInputElement;
const deleteButton = () => screen.getByRole("button", { name: /Hapus permanen/ });

describe("deleting an event", () => {
  it("warns that guest answers go too", () => {
    render(<DeleteEvent event={event} isFeatured={false} />);
    expect(screen.getByText(/konfirmasi kehadiran, dan masukan tamu/i)).toBeTruthy();
    expect(screen.getByText(/tidak dapat dibatalkan/i)).toBeTruthy();
  });

  it("refuses to delete the event currently on the front page", () => {
    render(<DeleteEvent event={event} isFeatured />);
    expect(screen.queryByRole("button", { name: /Hapus acara ini/ })).toBeNull();
    expect(screen.getByText(/sedang tayang di halaman utama/i)).toBeTruthy();
  });

  it("keeps the delete button disabled until the slug is typed exactly", () => {
    render(<DeleteEvent event={event} isFeatured={false} />);
    openConfirm();
    expect(deleteButton().hasAttribute("disabled")).toBe(true);
    fireEvent.change(confirmField(), { target: { value: "rapat-panitia" } });
    expect(deleteButton().hasAttribute("disabled")).toBe(true);
    fireEvent.change(confirmField(), { target: { value: event.slug } });
    expect(deleteButton().hasAttribute("disabled")).toBe(false);
  });

  it("sends a DELETE only after confirmation, then returns to the list", async () => {
    render(<DeleteEvent event={event} isFeatured={false} />);
    openConfirm();
    fireEvent.change(confirmField(), { target: { value: event.slug } });
    fireEvent.click(deleteButton());
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/admin"));
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`/api/admin/events/${event.id}`);
    expect(init.method).toBe("DELETE");
  });

  it("stays on the page and explains when the server refuses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, message: "Acara ini sedang tayang di halaman utama." }), { status: 409, headers: { "Content-Type": "application/json" } })));
    render(<DeleteEvent event={event} isFeatured={false} />);
    openConfirm();
    fireEvent.change(confirmField(), { target: { value: event.slug } });
    fireEvent.click(deleteButton());
    await vi.waitFor(() => expect(screen.getByText(/sedang tayang di halaman utama/i)).toBeTruthy());
    expect(replace).not.toHaveBeenCalled();
  });

  it("cancels without sending anything", () => {
    render(<DeleteEvent event={event} isFeatured={false} />);
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(confirmField()).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
