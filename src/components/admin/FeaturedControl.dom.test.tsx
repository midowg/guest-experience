import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FeaturedControl } from "./FeaturedControl";
import { createSeedEvent } from "@/lib/seed-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }) }));

const live = { ...createSeedEvent(), id: "10f3a511-2331-4000-8000-000000000001", status: "published" as const, title: "Rapat Panitia Inti" };
const other = { ...createSeedEvent(), id: "10f3a511-2331-4000-8000-000000000002", slug: "acara-lain", status: "published" as const, title: "Acara Lain" };
const draft = { ...createSeedEvent(), id: "10f3a511-2331-4000-8000-000000000003", slug: "acara-draft", status: "draft" as const, title: "Acara Draft" };

function reply(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  refresh.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => reply({ ok: true, data: { eventId: null }, message: "Halaman utama tidak menayangkan acara." })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("taking an event off the front page", () => {
  it("offers the take-down only while something is live", () => {
    const { unmount } = render(<FeaturedControl events={[live, other]} featuredId={live.id} />);
    expect(screen.getByRole("button", { name: /Turunkan dari halaman utama/ })).toBeTruthy();
    unmount();
    render(<FeaturedControl events={[live, other]} featuredId={null} />);
    expect(screen.queryByRole("button", { name: /Turunkan dari halaman utama/ })).toBeNull();
  });

  it("clears the selection on the server", async () => {
    render(<FeaturedControl events={[live]} featuredId={live.id} />);
    fireEvent.click(screen.getByRole("button", { name: /Turunkan dari halaman utama/ }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/admin/featured");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ eventId: null });
  });

  it("says other public links remain available", () => {
    render(<FeaturedControl events={[live]} featuredId={live.id} />);
    expect(screen.getByText(/tautan acara lain tetap aktif/i)).toBeTruthy();
  });

  it("explains that only one event occupies the homepage", () => {
    render(<FeaturedControl events={[live]} featuredId={live.id} />);
    expect(screen.getByText(/halaman utama menampilkan satu acara/i)).toBeTruthy();
  });

  it("shows only the selected event and leaves selection to event cards", () => {
    render(<FeaturedControl events={[live, draft]} featuredId={live.id} />);
    expect(screen.getByText(live.title)).toBeTruthy();
    expect(screen.queryByText(draft.title)).toBeNull();
    expect(screen.queryByRole("button", { name: "Tayangkan ini" })).toBeNull();
  });

  it("reports a refusal instead of claiming success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ ok: false, message: "Sesi berakhir." }, 401)));
    render(<FeaturedControl events={[live]} featuredId={live.id} />);
    fireEvent.click(screen.getByRole("button", { name: /Turunkan dari halaman utama/ }));
    await vi.waitFor(() => expect(screen.getByText(/Sesi berakhir/i)).toBeTruthy());
  });
});
