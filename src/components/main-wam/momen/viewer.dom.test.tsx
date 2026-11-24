import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { gridGeometry } from "@/lib/main-wam/momen/mosaic";
import { sampleGalleryMine, sampleMosaic } from "@/lib/main-wam/momen/sample";
import type { MosaicManifest, PhotoDetail } from "@/lib/main-wam/momen/types";
import { mainWamApi } from "@/lib/routes";
import { ToastProvider } from "@/components/main-wam/ui";

/* The photo viewer: a tap on a Mozaik cell (not a pan, a pinch or a double tap) opens the photo large with who, when and Simpan foto. */

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), refresh: vi.fn() }), usePathname: () => "/wam2026/momen" }));
let detailAnswer: PhotoDetail | Error = { id: "x", owner: { name: "Sari" }, mine: false, sessionTitle: "Pemaparan departemen", takenAt: "2027-01-05T03:00:00Z" };
const request = vi.fn(async (...args: unknown[]) => { void args; if (detailAnswer instanceof Error) throw detailAnswer; return { data: detailAnswer, message: "" }; });
vi.mock("@/components/pra-wam/api", () => ({ praWamRequest: (...args: unknown[]) => request(...args), errorText: () => "Gagal." }));

const { MosaicCanvas, TAP_WAIT_MS } = await import("./MosaicCanvas");
const { Mosaic } = await import("./Mosaic");

class TestPointerEvent extends MouseEvent {
  pointerId: number; isPrimary: boolean; pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; this.isPrimary = init.isPrimary ?? true; this.pointerType = init.pointerType ?? "touch"; }
}
beforeAll(() => {
  (window as unknown as { PointerEvent: unknown }).PointerEvent = TestPointerEvent;
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  window.matchMedia = window.matchMedia ?? ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as never;
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 340 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 245 });
});
beforeEach(() => { request.mockClear(); detailAnswer = { id: "x", owner: { name: "Sari" }, mine: false, sessionTitle: "Pemaparan departemen", takenAt: "2027-01-05T03:00:00Z" }; window.history.replaceState(null, "", "/wam2026/momen/mozaik"); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const manifest = sampleMosaic();
const withPhoto = (m: MosaicManifest) => m.tiles.filter(tile => m.cells[tile.cell] !== ".");
/** The point (in the canvas box, zoom 1) where a cell is. */
function centre(m: MosaicManifest, cell: number, gap = 1) {
  const geometry = gridGeometry({ width: 340 - 4, height: 245 - 4 }, m.columns, m.rows, gap);
  return { x: geometry.left + 2 + (cell % m.columns) * (geometry.cell + gap) + geometry.cell / 2, y: geometry.top + 2 + Math.floor(cell / m.columns) * (geometry.cell + gap) + geometry.cell / 2 };
}
const region = () => screen.getByRole("region", { name: "Kanvas mozaik" });
function tapAt(point: { x: number; y: number }, extra: { pointerType?: string; moveBy?: number } = {}) {
  const init = { pointerId: 1, isPrimary: true, pointerType: extra.pointerType ?? "touch", clientX: point.x, clientY: point.y };
  fireEvent.pointerDown(region(), init);
  if (extra.moveBy) fireEvent.pointerMove(region(), { ...init, clientX: point.x + extra.moveBy });
  fireEvent.pointerUp(region(), { ...init, clientX: point.x + (extra.moveBy ?? 0) });
}

describe("a tap on a Mozaik cell", () => {
  const tile = withPhoto(manifest)[10];
  const canvas = (onOpen = vi.fn(), onZoom = vi.fn(), m = manifest) => { render(<MosaicCanvas manifest={m} mark={false} zoom={1} onZoom={onZoom} focus={null} label="Mozaik" onOpen={onOpen} />); return { onOpen, onZoom }; };

  it("opens that cell's photo once the double-tap window has passed", () => {
    vi.useFakeTimers();
    const { onOpen } = canvas();
    tapAt(centre(manifest, tile.cell), { pointerType: "mouse" });
    expect(onOpen).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(TAP_WAIT_MS + 5); });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ cell: tile.cell, id: tile.id }));
    // Focus stays on the canvas, so closing the viewer brings it back here.
    expect(document.activeElement).toBe(region());
  });

  it("is not a tap when the finger moved (a pan) or a second finger came down (a pinch)", () => {
    vi.useFakeTimers();
    const { onOpen } = canvas();
    tapAt(centre(manifest, tile.cell), { moveBy: 30 });
    const point = centre(manifest, tile.cell);
    fireEvent.pointerDown(region(), { pointerId: 1, isPrimary: true, pointerType: "touch", clientX: point.x, clientY: point.y });
    fireEvent.pointerDown(region(), { pointerId: 2, isPrimary: false, pointerType: "touch", clientX: point.x + 40, clientY: point.y });
    fireEvent.pointerUp(region(), { pointerId: 1, isPrimary: true, pointerType: "touch", clientX: point.x, clientY: point.y });
    fireEvent.pointerUp(region(), { pointerId: 2, isPrimary: false, pointerType: "touch", clientX: point.x + 40, clientY: point.y });
    // A scroll the browser takes over ends in pointercancel.
    fireEvent.pointerDown(region(), { pointerId: 3, isPrimary: true, pointerType: "touch", clientX: point.x, clientY: point.y });
    fireEvent.pointerCancel(region(), { pointerId: 3, isPrimary: true, pointerType: "touch", clientX: point.x, clientY: point.y });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("is overtaken by a double tap, which zooms and opens nothing", () => {
    vi.useFakeTimers();
    const { onOpen, onZoom } = canvas();
    tapAt(centre(manifest, tile.cell));
    tapAt(centre(manifest, tile.cell));
    fireEvent.doubleClick(region());
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onZoom).toHaveBeenCalledWith(2);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does nothing on a cell without a photo, on the faint grid outside the letters, or a mouse click beside a cell", () => {
    vi.useFakeTimers();
    const { onOpen } = canvas();
    const empty = [...manifest.cells].findIndex((char, cell) => char !== "." && !manifest.tiles.some(item => item.cell === cell));
    const outside = [...manifest.cells].findIndex(char => char === ".");
    tapAt(centre(manifest, empty), { pointerType: "mouse" });
    tapAt(centre(manifest, outside), { pointerType: "mouse" });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("with a finger forgives a few pixels: a tap in the gap next to a photo opens the nearest one", () => {
    vi.useFakeTimers();
    const { onOpen } = canvas();
    const point = centre(manifest, tile.cell);
    tapAt({ x: point.x + 3.9, y: point.y });
    act(() => { vi.advanceTimersByTime(TAP_WAIT_MS + 5); });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("from the keyboard: arrows pick a cell with a photo (announced), Enter opens it, Escape lets go", () => {
    const { onOpen } = canvas();
    const live = () => region().parentElement!.querySelector("[aria-live]")!.textContent;
    expect(region().getAttribute("aria-describedby")).toBeTruthy();
    fireEvent.keyDown(region(), { key: "ArrowRight" });
    expect(live()).toMatch(/kotak ke-\d+\. Tekan Enter untuk membuka foto\.$/);
    fireEvent.keyDown(region(), { key: "ArrowRight" });
    fireEvent.keyDown(region(), { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(1);
    const opened = onOpen.mock.calls[0][0];
    expect(manifest.cells[opened.cell]).not.toBe(".");
    fireEvent.keyDown(region(), { key: "Escape" });
    expect(live()).toBe("");
  });
});

describe("the viewer in the Mozaik", () => {
  const sampleTile = () => withPhoto(manifest)[10];
  const mosaic = (m = manifest, demo = true) => render(<ToastProvider><Mosaic initial={m} mark={false} title="Mozaik WAM 2026" demo={demo} /></ToastProvider>);

  it("a sample tile opens a sheet at once with the large picture, a made-up name, session and time, Simpan foto and a Tutup button", async () => {
    vi.useFakeTimers();
    mosaic();
    tapAt(centre(manifest, sampleTile().cell));
    act(() => { vi.advanceTimersByTime(TAP_WAIT_MS + 5); });
    const sheet = screen.getByRole("dialog");
    // Nothing is asked of the server for a sample photo.
    expect(request).not.toHaveBeenCalled();
    expect(within(sheet).getByRole("img", { name: /^Foto oleh / }).getAttribute("src")).toMatch(/^\/wam\/demo\/foto-\d\d\.svg$/);
    expect(within(sheet).getByRole("heading").textContent).toMatch(/\S/);
    expect(within(sheet).getByRole("button", { name: "Simpan foto" })).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "Tutup" })).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
  });

  it("Simpan foto downloads the sample's own file under a plain name (wam-2026-….svg)", () => {
    vi.useFakeTimers();
    const clicked: { href: string; download: string }[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { clicked.push({ href: this.getAttribute("href")!, download: this.download }); });
    mosaic();
    tapAt(centre(manifest, sampleTile().cell));
    act(() => { vi.advanceTimersByTime(TAP_WAIT_MS + 5); });
    fireEvent.click(screen.getByRole("button", { name: "Simpan foto" }));
    expect(clicked).toHaveLength(1);
    expect(clicked[0].href).toMatch(/^\/wam\/demo\/foto-\d\d\.svg$/);
    expect(clicked[0].download).toMatch(/^wam-2026-[0-9a-z]+\.svg$/);
    click.mockRestore();
  });

  it("a real tile asks the server for the details, shows the large photo from the file route, and saves through ?unduh=1 as a .jpg", async () => {
    const real = { ...manifest, tiles: manifest.tiles.map(tile => ({ ...tile, src: `https://r2.example/${tile.id}-ubin.jpg` })) };
    const tile = withPhoto(real)[10];
    detailAnswer = { id: tile.id, owner: { name: "Sari" }, mine: false, sessionTitle: "Pemaparan departemen", takenAt: "2027-01-05T03:00:00Z" };
    const clicked: { href: string; download: string }[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { clicked.push({ href: this.getAttribute("href")!, download: this.download }); });
    vi.useFakeTimers();
    mosaic(real, false);
    tapAt(centre(real, tile.cell));
    act(() => { vi.advanceTimersByTime(TAP_WAIT_MS + 5); });
    vi.useRealTimers();
    // The sheet is open before the details arrive, with a frame and the large picture already asked for.
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByTestId("viewer-frame")).toBeTruthy();
    expect(sheet.querySelector("img")!.getAttribute("src")).toBe(mainWamApi.photoFile(tile.id, "besar"));
    await waitFor(() => expect(within(sheet).getByRole("heading", { name: "Sari" })).toBeTruthy());
    expect(request).toHaveBeenCalledWith(mainWamApi.photo(tile.id));
    expect(sheet.textContent).toContain("Pemaparan departemen");
    fireEvent.click(within(sheet).getByRole("button", { name: "Simpan foto" }));
    expect(clicked[0].href).toBe(mainWamApi.photoDownload(tile.id));
    expect(clicked[0].href).toContain("unduh=1");
    expect(clicked[0].download).toMatch(/^wam-2026-[0-9a-z]+\.jpg$/);
    click.mockRestore();
  });

  it("names the photo by the Momen rule: one's own is Fotomu, someone else's is their name; a failed detail says so and can be retried", async () => {
    const real = { ...manifest, tiles: manifest.tiles.map(tile => ({ ...tile, src: `https://r2.example/${tile.id}-ubin.jpg` })) };
    const tile = withPhoto(real)[10];
    detailAnswer = { id: tile.id, owner: { name: "Rani" }, mine: true, sessionTitle: null, takenAt: "2027-01-05T03:00:00Z" };
    vi.useFakeTimers();
    mosaic(real, false);
    tapAt(centre(real, tile.cell));
    act(() => { vi.advanceTimersByTime(TAP_WAIT_MS + 5); });
    vi.useRealTimers();
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("heading", { name: "Fotomu" })).toBeTruthy());
    cleanup();

    detailAnswer = new Error("gagal");
    vi.useFakeTimers();
    mosaic(real, false);
    tapAt(centre(real, tile.cell));
    act(() => { vi.advanceTimersByTime(TAP_WAIT_MS + 5); });
    vi.useRealTimers();
    await waitFor(() => expect(screen.getByText(/Keterangan foto belum bisa dimuat/)).toBeTruthy());
    // The photo and Simpan foto still work without the details.
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Simpan foto" })).toBeTruthy();
    detailAnswer = { id: tile.id, owner: { name: "Sari" }, mine: false, sessionTitle: null, takenAt: "2027-01-05T03:00:00Z" };
    fireEvent.click(within(screen.getByRole("dialog")).getAllByRole("button", { name: "Coba lagi" })[0]);
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("heading", { name: "Sari" })).toBeTruthy());
  });

  it("a picture that cannot load says so with a retry (never a blank block), and closing returns focus to the canvas", async () => {
    vi.useFakeTimers();
    mosaic();
    tapAt(centre(manifest, sampleTile().cell));
    act(() => { vi.advanceTimersByTime(TAP_WAIT_MS + 5); });
    vi.useRealTimers();
    const sheet = screen.getByRole("dialog");
    fireEvent.error(sheet.querySelector("img")!);
    expect(within(sheet).getByRole("alert").textContent).toContain("Foto belum bisa dimuat.");
    expect(within(sheet).getByRole("button", { name: "Coba lagi" })).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Tutup" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(region()));
  });
});

describe("Fotoku in the Mozaik", () => {
  const mosaic = (own = sampleGalleryMine, extra: Partial<React.ComponentProps<typeof Mosaic>> = {}) =>
    render(<ToastProvider><Mosaic initial={manifest} mark={false} title="Mozaik WAM 2026" demo own={own} ownTotal={own.length} {...extra} /></ToastProvider>);

  it("lists the person's own photos under the mosaic, with a picture in every tile", () => {
    mosaic();
    const list = screen.getByRole("list", { name: "Fotoku" });
    expect(within(list).getAllByRole("button")).toHaveLength(sampleGalleryMine.length);
    for (const image of list.querySelectorAll("img")) expect(image.getAttribute("src")).toMatch(/^\/wam\/demo\/foto-\d\d\.svg$/);
  });

  it("shows nothing when there is no photo of one's own", () => {
    mosaic([]);
    expect(screen.queryByRole("list", { name: "Fotoku" })).toBeNull();
  });

  it("a photo of one's own opens the viewer (Fotomu, large photo, Simpan foto) with Hapus foto under it", () => {
    mosaic();
    fireEvent.click(within(screen.getByRole("list", { name: "Fotoku" })).getAllByRole("button", { name: /^Fotomu/ })[0]);
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("heading", { name: "Fotomu" })).toBeTruthy();
    expect(within(sheet).getByRole("img", { name: "Fotomu" }).getAttribute("src")).toMatch(/^\/wam\/demo\/foto-\d\d\.svg$/);
    expect(within(sheet).getByRole("button", { name: "Simpan foto" })).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "Hapus foto" })).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
  });

  it("marks a photo under review or hidden (also one that is not in the mosaic) and says it in the viewer", () => {
    const own = [{ ...sampleGalleryMine[0], status: "ditinjau" as const }, { ...sampleGalleryMine[1], status: "disembunyikan" as const }];
    mosaic(own);
    const list = screen.getByRole("list", { name: "Fotoku" });
    expect(list.textContent).toContain("Ditinjau");
    expect(list.textContent).toContain("Disembunyikan");
    fireEvent.click(within(list).getAllByRole("button")[0]);
    expect(within(screen.getByRole("dialog")).getByText("Ditinjau panitia")).toBeTruthy();
  });

  it("Hapus foto asks first, then the photo leaves Fotoku (a sample photo asks nothing of the server)", async () => {
    mosaic();
    const list = () => screen.getByRole("list", { name: "Fotoku" });
    fireEvent.click(within(list()).getAllByRole("button")[0]);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Hapus foto" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Hapus foto" }));
    await waitFor(() => expect(within(list()).getAllByRole("button")).toHaveLength(sampleGalleryMine.length - 1));
    expect(request).not.toHaveBeenCalled();
  });

  it("has no link to a Galeri anywhere (\"Lihat foto\" opens the viewer in place)", () => {
    const { container } = mosaic(sampleGalleryMine, { mark: true });
    expect(container.querySelector('a[href*="galeri"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Lihat foto" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(container.querySelector('a[href*="galeri"]')).toBeNull();
  });
});
