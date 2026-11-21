import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { sampleFeedSemua } from "@/lib/main-wam/momen/sample";
import { SEEN_KEY } from "@/lib/main-wam/momen/seen";
import { mainWamApi } from "@/lib/routes";
import { ToastProvider } from "@/components/main-wam/ui";

/*
 * The stack as Instagram Instants: a photo that was in front is told to the server (also the person's own), a mark that failed
 * is sent again, marks left from an earlier visit keep their photos out, and a photo that arrives after "Kamu sudah lihat semua"
 * shows as new. Real network paths (not demo): fetch and the photo list are stubbed.
 */

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), refresh: vi.fn() }), usePathname: () => "/wam/acara/momen" }));
vi.mock("./upload/QueueRunner", () => ({ MomenQueueRunner: () => null }));
const request = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ data: { items: [], next: null, total: 0, sessions: null, migrated: true }, message: "" }));
vi.mock("@/components/pra-wam/api", () => ({ praWamRequest: (...args: unknown[]) => request(...args), errorText: () => "Gagal." }));
const { MomenStack } = await import("./MomenStack");

const now = new Date("2027-01-05T10:05:00+07:00");
const props = {
  mode: "baru" as const, session: null, sessionTitle: null, items: sampleFeedSemua.slice(0, 3), next: null, total: 3, startIndex: 0, offset: 0,
  mozaik: true, migrated: true, anyPhotos: true, own: null, eventName: "WAM 2026", nowIso: now.toISOString(),
};
const [A, B, C] = sampleFeedSemua.slice(0, 3).map(photo => photo.id);
const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<{ ok: boolean; status: number }>>();
const sentIds = () => fetchMock.mock.calls.map(call => JSON.parse(String(call[1].body)).ids as string[]);
const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

beforeAll(() => {
  window.matchMedia = window.matchMedia ?? ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as never;
});
beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  request.mockClear();
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("the stack marks photos seen the moment they are in front", () => {
  it("tells the server the front photo and each one swiped to, in batches (the first one at once, never twice)", async () => {
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    await tick(3000);
    expect(fetchMock.mock.calls[0][0]).toBe(mainWamApi.photosSeen);
    expect(sentIds()).toEqual([[A]]);
    fireEvent.keyDown(screen.getByRole("region", { name: "Momen" }), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("region", { name: "Momen" }), { key: "ArrowRight" });
    await tick(3000);
    expect(sentIds()).toEqual([[A], [B, C]]);
    fireEvent.keyDown(screen.getByRole("region", { name: "Momen" }), { key: "ArrowLeft" });
    await tick(6000);
    expect(sentIds()).toHaveLength(2);
  });

  it("marks the person's own photo too (it shows once, first, then it is gone from the stack)", async () => {
    const items = props.items.map((photo, index) => (index === 0 ? { ...photo, mine: true } : photo));
    render(<ToastProvider><MomenStack {...props} items={items} /></ToastProvider>);
    expect(screen.getByText("Fotomu")).toBeTruthy();
    await tick(3000);
    expect(sentIds()).toEqual([[A]]);
  });

  it("does not mark a photo the server already calls seen (the gallery's \"Sudah dilihat\" ones)", async () => {
    render(<ToastProvider><MomenStack {...props} mode="galeri" items={props.items.map((photo, index) => (index === 0 ? { ...photo, seen: true } : photo))} /></ToastProvider>);
    await tick(3000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a failed send (offline, 503) stays queued and goes out again; a closing page sends what is left with keepalive", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ok: false, status: 503 });
    const { unmount } = render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    await tick(3000);
    expect(JSON.parse(window.localStorage.getItem(SEEN_KEY)!)).toEqual([A]);
    await tick(3000);
    expect(JSON.parse(window.localStorage.getItem(SEEN_KEY)!)).toEqual([A]);
    await tick(3000);
    expect(sentIds()).toEqual([[A], [A], [A]]);
    expect(window.localStorage.getItem(SEEN_KEY)).toBeNull();
    fireEvent.keyDown(screen.getByRole("region", { name: "Momen" }), { key: "ArrowRight" });
    unmount();
    expect(sentIds().at(-1)).toEqual([B]);
    expect((fetchMock.mock.calls.at(-1)![1] as RequestInit).keepalive).toBe(true);
  });

  it("marks left from an earlier visit (a send that never went out) keep their photos out of the stack", async () => {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([A]));
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    expect(screen.getByRole("group", { name: /^Foto ke-1 dari 2 foto baru/ })).toBeTruthy();
    expect(screen.getByRole("group", { name: /^Foto ke-1 dari 2 foto baru/ })).toBeTruthy();
    await tick(0);
    expect(sentIds()[0]).toContain(A);
  });
});

describe("after \"Kamu sudah lihat semua\"", () => {
  it("looks for new photos now and then, and a photo that came in shows as new", async () => {
    render(<ToastProvider><MomenStack {...props} items={[]} total={0} /></ToastProvider>);
    expect(screen.getByRole("heading", { name: "Kamu sudah lihat semua" })).toBeTruthy();
    await tick(20_000);
    expect(request).toHaveBeenCalledWith(mainWamApi.photos({ sebelum: "b~" }));
    expect(screen.getByRole("heading", { name: "Kamu sudah lihat semua" })).toBeTruthy();
    request.mockResolvedValueOnce({ data: { items: [{ ...sampleFeedSemua[0], seen: false }], next: null, total: 1, sessions: null, migrated: true }, message: "" });
    await tick(20_000);
    expect(screen.queryByRole("heading", { name: "Kamu sudah lihat semua" })).toBeNull();
    expect(screen.getByRole("group", { name: /^Foto ke-1 dari 1 foto baru/ })).toBeTruthy();
  });

  it("does not bring back a photo that was seen in this visit but is still queued", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<ToastProvider><MomenStack {...props} items={props.items.slice(0, 1)} total={1} /></ToastProvider>);
    await tick(1000);
    fireEvent.keyDown(screen.getByRole("region", { name: "Momen" }), { key: "ArrowRight" });
    expect(screen.getByRole("heading", { name: "Kamu sudah lihat semua" })).toBeTruthy();
    request.mockResolvedValue({ data: { items: [{ ...sampleFeedSemua[0], seen: false }], next: null, total: 1, sessions: null, migrated: true }, message: "" });
    await tick(20_000);
    expect(screen.getByRole("heading", { name: "Kamu sudah lihat semua" })).toBeTruthy();
  });

  it("does not look in the sessions' or the gallery's stack (only the stack of new photos)", async () => {
    render(<ToastProvider><MomenStack {...props} mode="sesi" session="x" items={[]} total={0} /></ToastProvider>);
    await tick(40_000);
    expect(request).not.toHaveBeenCalled();
  });
});
