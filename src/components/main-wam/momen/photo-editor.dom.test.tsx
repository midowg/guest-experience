import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { LangProvider } from "@/components/main-wam/i18n";
import { setActiveLang } from "@/lib/main-wam/i18n";
import type { TagCandidate } from "@/lib/main-wam/misi/rules";
import type { QueueItem } from "@/lib/main-wam/momen/queue";
import { sampleSessions } from "@/lib/main-wam/sample";
import { mainWamPath } from "@/lib/routes";
import { ToastProvider } from "@/components/main-wam/ui";

/*
 * "Foto baru" (docs/main-wam/KONTRAK.md §40): the editor between the shutter and Kirim, in the style of a posting app and drawn to fit one screen: a plain top bar
 * (back = Ulangi, ✕ = Batal), the photo, [Sign | Filter] over ONE row of preview tiles, a row of chips (Tag orang, Tandai lokasi, Simpan asli di HP) and Kirim alone at the
 * bottom. It opens at once, shows the sign and the filter live over the plain picture, draws them only at Kirim, applies a look to all photos on request, tags people
 * without a limit in a bottom sheet (a search, BOD chips; "Tanya setiap foto" opens it by itself), and keeps the original on the phone (not for gallery pictures).
 */

const push = vi.fn();
const back = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push, back, refresh: vi.fn() }), usePathname: () => "/wam2026/momen/kamera" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/components/main-wam/theme/font", () => ({ mainWamFontVars: "" }));
const compress = vi.hoisted(() => ({ looks: [] as [string | undefined, string | undefined][], taken: [] as (string | undefined)[], frame: null as null | (() => Promise<File>) }));
vi.mock("./upload/compress", () => {
  const blob = (text: string) => Object.assign(new Blob([text]), { arrayBuffer: async () => new ArrayBuffer(text.length) });
  return {
    PhotoProblem: class extends Error {},
    decodeFile: async () => ({ source: {}, width: 1200, height: 1500, close: () => undefined }),
    frameFile: () => (compress.frame ? compress.frame() : Promise.resolve(new File(["x"], "momen.jpg", { type: "image/jpeg" }))),
    applyLook: async (picture: unknown, sign?: string, tone?: string, taken?: string) => { compress.looks.push([sign, tone]); compress.taken.push(taken); return picture; },
    prepareInTurn: <T,>(work: () => Promise<T>) => work(),
    prepareMomenPhoto: async () => ({ besar: blob("b"), kecil: blob("k"), ubin: blob("u"), width: 1200, height: 1500 }),
  };
});
const saved = vi.hoisted(() => ({ files: [] as File[], fail: false }));
vi.mock("./saveFile", () => ({
  saveOriginal: async (file: File) => { if (saved.fail) throw new Error("no"); saved.files.push(file); return "diunduh"; },
  saveFile: () => undefined,
}));
const queue = vi.hoisted(() => ({ added: [] as unknown[][] }));
vi.mock("./upload/sender", () => ({
  momenQueue: () => ({
    add: async (items: unknown[]) => { queue.added.push(items); }, cancel: async () => undefined, sentId: async () => "photo-1",
    onEvent: () => () => undefined, snapshot: () => ({ items: [], summary: { waiting: 0, offline: false } }), subscribe: () => () => undefined,
  }),
}));
vi.mock("./upload/QueueRunner", () => ({ MomenQueueRunner: () => null, useMomenQueue: () => ({ summary: { waiting: 0, offline: false }, items: [] }) }));
vi.mock("@/components/main-wam/misi/request", () => ({ misiRequest: vi.fn(), errorText: () => "Gagal." }));

const { CameraScreen } = await import("./CameraScreen");

const person = (name: string, department: string, extra: Partial<TagCandidate> = {}): TagCandidate => ({ id: `00000000-0000-4000-8000-${String(name.length * 1000 + name.charCodeAt(0)).padStart(12, "0")}`, name, department, bod: false, seatmate: false, roommate: false, ...extra });
const ARMAN = person("Arman", "BOD", { bod: true });
const WULAN = person("Wulan", "BOD", { bod: true });
const SARI = person("Sari", "HRGA", { roommate: true });
const BIMA = person("Bima", "Finance");
const MANY = [ARMAN, WULAN, SARI, BIMA, ...Array.from({ length: 12 }, (_, index) => person(`Peserta${"X".repeat(index)}`, "Operasional", { photo: index === 0 ? "/wam/demo/foto-01.svg" : null }))];

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  window.matchMedia = window.matchMedia ?? ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as never;
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  URL.createObjectURL = () => "blob:foto";
  URL.revokeObjectURL = () => undefined;
});
beforeEach(() => { queue.added = []; saved.files = []; saved.fail = false; compress.looks = []; compress.taken = []; compress.frame = null; push.mockClear(); back.mockClear(); window.localStorage.clear(); window.localStorage.setItem("mw-momen-kamera", "izin"); });
afterEach(() => { cleanup(); setActiveLang("id"); });

/** Not a preview, so what this phone chose before (browser storage) is read; `ask` false = "Tanya setiap foto" off (the Tag sheet does not open by itself). */
const camera = (props: { candidates?: TagCandidate[]; detect?: boolean; ask?: boolean } = {}) => {
  if (props.ask === false) window.localStorage.setItem("mw-momen-tag", "tidak");
  return <LangProvider lang="id"><ToastProvider>
    <CameraScreen sessions={sampleSessions} nowIso="2027-01-05T15:20:00+07:00" absen migrated initialSession={null} candidates={props.candidates ?? []} detect={props.detect ?? false} />
  </ToastProvider></LangProvider>;
};
const mount = async (props: Parameters<typeof camera>[0] = {}) => { const view = render(camera(props)); await act(async () => undefined); return view; };
const file = (name = "foto.jpg") => new File(["x"], name, { type: "image/jpeg" });
const shoot = async () => { await act(async () => { fireEvent.change(document.querySelector<HTMLInputElement>("input[type=file][capture]")!, { target: { files: [file()] } }); }); };
const pick = async (count: number) => { await act(async () => { fireEvent.change(document.querySelector<HTMLInputElement>("input[type=file][multiple]")!, { target: { files: Array.from({ length: count }, (_, index) => file(`g${index}.jpg`)) } }); }); };
const editor = () => screen.getByRole("dialog", { name: "Foto baru" });
const control = (name: string | RegExp) => within(editor()).getByRole("button", { name });
const toggle = (name: string) => within(editor()).getByRole("switch", { name });
const send = async () => { await act(async () => { fireEvent.click(control(/^Kirim/)); }); };
const tagSheet = () => screen.getByRole("dialog", { name: "Tag orang" });
/** The photo itself (the big one): its picture, the thin colour layer and the sign drawn over it. */
const frame = () => document.querySelector("[data-momen-editor] img[alt^='Pratinjau']") as HTMLImageElement;
const frameBox = () => document.querySelector("[data-momen-editor] [class*='_frame_']") as HTMLElement;
const overlay = () => frameBox().querySelector("svg[data-sign]") as SVGElement | null;
const matte = () => frameBox().querySelector("[class*='_matte_']") as HTMLElement | null;
const showFilter = () => fireEvent.click(within(within(editor()).getByRole("radiogroup", { name: "Gaya foto" })).getByRole("radio", { name: "Filter" }));
const showSign = () => fireEvent.click(within(within(editor()).getByRole("radiogroup", { name: "Gaya foto" })).getByRole("radio", { name: "Sign" }));
const signs = () => within(editor()).getByRole("radiogroup", { name: "Sign foto" });
const tones = () => within(editor()).getByRole("radiogroup", { name: "Filter foto" });
const names = (group: HTMLElement) => within(group).getAllByRole("radio").map(radio => radio.querySelector("[class*='_tileName_']")!.textContent);

describe("the layout", () => {
  it("is one screen in the style of a posting app: a plain top bar (back = Ulangi, the title, the Simpan asli di HP toggle at the right), the photo, [Sign | Filter] over ONE row of tiles, the chips, and Kirim alone at the bottom", async () => {
    await mount({ candidates: MANY, detect: true, ask: false });
    await shoot();
    const dialog = editor();
    expect(within(dialog).getByRole("heading", { name: "Foto baru" })).toBeTruthy();
    expect(control("Ulangi, kembali ke kamera")).toBeTruthy();
    expect(control("Simpan asli di HP").getAttribute("aria-pressed")).toBe("true");
    expect(within(dialog).queryByRole("button", { name: "Batal" })).toBeNull(); // no ✕: back is the way out
    const segments = within(dialog).getByRole("radiogroup", { name: "Gaya foto" });
    expect(within(segments).getAllByRole("radio").map(radio => radio.textContent)).toEqual(["Sign", "Filter"]);
    expect(within(segments).getByRole("radio", { name: "Sign" }).getAttribute("aria-checked")).toBe("true");
    // one row of tiles at a time: the signs, then the filters instead of them
    expect(within(dialog).getAllByRole("radiogroup")).toHaveLength(2); // the switch and the row
    showFilter();
    expect(within(dialog).getAllByRole("radiogroup")).toHaveLength(2);
    expect(tones()).toBeTruthy();
    expect(within(dialog).queryByRole("radiogroup", { name: "Sign foto" })).toBeNull();
    // the chips: Tag orang opens the sheet, Tandai lokasi is a switch (Simpan asli is the toggle in the top bar)
    expect(control("Tag orang").getAttribute("aria-haspopup")).toBe("dialog");
    expect(toggle("Tandai lokasi").getAttribute("aria-checked")).toBe("false");
    // no long explanations; the only button at the bottom is Kirim (one photo: no counter, no strip, no "Terapkan ke semua foto")
    expect(within(dialog).queryByText(/Salinan asli|Lokasi hanya|Dilipat|Orang yang kamu tandai/)).toBeNull();
    expect(within(dialog).queryByText("Terapkan ke semua foto")).toBeNull();
    expect(within(dialog).queryByRole("group", { name: "Foto yang akan dikirim" })).toBeNull();
    expect(within(dialog).queryByText("Batal")).toBeNull();
    expect(within(dialog).queryByText("Ulangi")).toBeNull();
    expect(within(dialog).getAllByRole("button").filter(button => /^Kirim/.test(button.textContent ?? ""))).toHaveLength(1);
  });

  it("the Sign row shows your photo with each sign (a tile and its name), the Filter row your photo in each filter", async () => {
    await mount();
    await shoot();
    expect(names(signs())).toEqual(["Tanpa", "Tanda", "Label", "Bingkai", "Film", "Poster", "Polaroid", "Jaringan"]);
    expect(within(signs()).getAllByRole("radio").map(radio => radio.querySelector("svg[data-sign]")?.getAttribute("data-sign") ?? null)).toEqual([null, "tanda", "label", "bingkai", "film", "poster", "polaroid", "jaringan"]);
    expect(within(signs()).getAllByRole("radio").every(radio => radio.querySelector("img"))).toBe(true);
    showFilter();
    expect(names(tones())).toEqual(["Asli", "Cerah", "Hangat", "Sejuk", "Pudar", "Mono"]);
    expect(within(tones()).getAllByRole("radio").map(radio => (radio.querySelector("img") as HTMLImageElement).style.filter)).toEqual([
      "none", "brightness(1.06) contrast(1.05) saturate(1.12)", "sepia(0.18) saturate(1.08) hue-rotate(-8deg) brightness(1.03)",
      "saturate(0.95) hue-rotate(8deg) brightness(1.02) contrast(1.03)", "contrast(0.9) saturate(0.85) brightness(1.06)", "grayscale(1) contrast(1.08)"]);
    // Sejuk and Pudar show their thin colour layer on the tile, like the big photo
    expect(within(tones()).getAllByRole("radio").map(radio => (radio.querySelector("[class*='_matte_']") as HTMLElement | null)?.style.background ?? null)).toEqual([null, null, null, "rgba(47, 111, 235, 0.08)", "rgba(255, 255, 255, 0.06)", null]);
  });

  it("the chosen tile is ringed (aria-checked) and the chosen sign or filter comes into view in the row", async () => {
    await mount();
    await shoot();
    fireEvent.click(within(signs()).getByRole("radio", { name: "Poster" }));
    expect(within(signs()).getByRole("radio", { name: "Poster" }).getAttribute("aria-checked")).toBe("true");
    expect(within(signs()).getByRole("radio", { name: "Tanpa" }).getAttribute("aria-checked")).toBe("false");
  });
});

describe("opening", () => {
  it("opens at once after a shot with Kirim waiting for the frame: a skeleton, then the photo (the camera captured the plain frame)", async () => {
    let finish: (value: File) => void = () => undefined;
    compress.frame = () => new Promise<File>(resolve => { finish = resolve; });
    // A live viewfinder: a stream the shutter can read.
    const track = { stop: vi.fn() };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [track] }) } });
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "granted" }) } });
    HTMLMediaElement.prototype.play = (() => Promise.resolve()) as never;
    render(<LangProvider lang="id"><ToastProvider><CameraScreen sessions={sampleSessions} nowIso="2027-01-05T15:20:00+07:00" absen migrated initialSession={null} candidates={[]} /></ToastProvider></LangProvider>);
    const shutter = await screen.findByRole("button", { name: /Ambil foto/ });
    await waitFor(() => expect((shutter as HTMLButtonElement).disabled).toBe(false));
    await waitFor(() => expect(document.querySelector("video")).toBeTruthy());
    await act(async () => { fireEvent.click(shutter); });
    expect(editor()).toBeTruthy();
    expect(within(editor()).getByRole("status", { name: "Menyiapkan foto" })).toBeTruthy();
    expect((control("Menunggu foto") as HTMLButtonElement).disabled).toBe(true);
    expect(queue.added).toEqual([]);
    await act(async () => { finish(file()); });
    expect(control("Kirim")).toBeTruthy();
    expect(within(editor()).getByRole("img", { name: "Pratinjau fotomu" })).toBeTruthy();
    expect(compress.looks).toEqual([]);
    expect(track.stop).toHaveBeenCalled(); // the camera rests while the photo is looked at
  });

  it("opens after a shot from the phone's own camera, and after a pick from the gallery (several photos: the counter 1/3, a small strip and the count on Kirim)", async () => {
    const { unmount } = await mount();
    await shoot();
    expect(editor()).toBeTruthy();
    expect(within(editor()).queryByRole("group", { name: "Foto yang akan dikirim" })).toBeNull();
    unmount();
    await mount();
    await pick(3);
    expect(within(editor()).getByText("1/3")).toBeTruthy();
    expect(within(within(editor()).getByRole("group", { name: "Foto yang akan dikirim" })).getAllByRole("button")).toHaveLength(3);
    expect(control("Kirim · 3 foto")).toBeTruthy();
  });

  it("nothing is sent until Kirim", async () => {
    await mount();
    await shoot();
    expect(queue.added).toEqual([]);
  });

  it("a file that is not a photo is left out with the reason, and the editor does not open when none is left", async () => {
    await mount();
    await act(async () => { fireEvent.change(document.querySelector<HTMLInputElement>("input[type=file][multiple]")!, { target: { files: [new File(["x"], "a.pdf", { type: "application/pdf" })] } }); });
    expect(screen.queryByRole("dialog", { name: "Foto baru" })).toBeNull();
    expect(screen.getByText("Pilih foto JPG, PNG, WebP, atau HEIC.")).toBeTruthy();
  });
});

describe("sign and filter", () => {
  it("start as Tanpa and Asli with nothing drawn; a sign and a filter change the preview apart and combine, over the plain picture", async () => {
    await mount();
    await shoot();
    expect(within(signs()).getByRole("radio", { name: "Tanpa" }).getAttribute("aria-checked")).toBe("true");
    expect(overlay()).toBeNull();
    expect(frame().style.filter).toBe("none");
    expect(matte()).toBeNull();
    fireEvent.click(within(signs()).getByRole("radio", { name: "Polaroid" }));
    expect(overlay()!.getAttribute("data-sign")).toBe("polaroid");
    expect(overlay()!.getAttribute("viewBox")).toBe("0 0 400 500");
    expect(overlay()!.textContent).toContain("WAM 2026, Kota Batu");
    expect(overlay()!.textContent).toContain("5 Januari 2027"); // the date of the shot (the editor's clock is the server's: 5 Jan 2027, 15.20)
    expect(frame().style.filter).toBe("none");
    showFilter();
    expect(within(tones()).getByRole("radio", { name: "Asli" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(tones()).getByRole("radio", { name: "Hangat" }));
    expect(frame().style.filter).toBe("sepia(0.18) saturate(1.08) hue-rotate(-8deg) brightness(1.03)");
    expect(overlay()!.getAttribute("data-sign")).toBe("polaroid");
    expect(overlay()!.getAttribute("style") ?? "").not.toMatch(/filter/);
    // Sejuk adds its thin blue layer under the sign
    fireEvent.click(within(tones()).getByRole("radio", { name: "Sejuk" }));
    expect(matte()!.style.background).toBe("rgba(47, 111, 235, 0.08)");
    fireEvent.click(within(tones()).getByRole("radio", { name: "Pudar" }));
    expect(matte()!.style.background).toBe("rgba(255, 255, 255, 0.06)");
    fireEvent.click(within(tones()).getByRole("radio", { name: "Mono" }));
    expect(matte()).toBeNull();
    showSign();
    fireEvent.click(within(signs()).getByRole("radio", { name: "Film" }));
    expect(overlay()!.getAttribute("data-sign")).toBe("film");
    expect(overlay()!.textContent).toContain("▶ 12A");
    expect(overlay()!.textContent).toContain("05 01 '27");
    fireEvent.click(within(signs()).getByRole("radio", { name: "Tanpa" }));
    showFilter();
    fireEvent.click(within(tones()).getByRole("radio", { name: "Asli" }));
    expect(overlay()).toBeNull();
    expect(frame().style.filter).toBe("none");
  });

  it("are drawn only when Kirim is pressed (filter first, then the sign, with the time of the shot), and the queue gets the result", async () => {
    await mount();
    await shoot();
    fireEvent.click(within(signs()).getByRole("radio", { name: "Jaringan" }));
    showFilter();
    fireEvent.click(within(tones()).getByRole("radio", { name: "Mono" }));
    expect(compress.looks).toEqual([]);
    await send();
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect(compress.looks).toEqual([["jaringan", "mono"]]);
    expect(compress.taken).toHaveLength(1);
    expect(Date.parse(compress.taken[0] as string)).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog", { name: "Foto baru" })).toBeNull();
  });

  it("with several photos the change goes to the chosen photo only; the chip Terapkan ke semua foto (beside [Sign | Filter]) copies it to all and keeps applying", async () => {
    await mount();
    await pick(3);
    const strip = within(editor()).getByRole("group", { name: "Foto yang akan dikirim" });
    fireEvent.click(within(signs()).getByRole("radio", { name: "Label" }));
    fireEvent.click(within(strip).getByRole("button", { name: "Foto 2" }));
    expect(within(editor()).getByText("2/3")).toBeTruthy();
    expect(within(signs()).getByRole("radio", { name: "Tanpa" }).getAttribute("aria-checked")).toBe("true");
    expect(overlay()).toBeNull();
    showFilter();
    fireEvent.click(within(tones()).getByRole("radio", { name: "Mono" }));
    const all = toggle("Terapkan ke semua foto");
    expect(all.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(all);
    expect(all.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(strip).getByRole("button", { name: "Foto 3" }));
    expect(within(tones()).getByRole("radio", { name: "Mono" }).getAttribute("aria-checked")).toBe("true");
    showSign();
    expect(within(signs()).getByRole("radio", { name: "Tanpa" }).getAttribute("aria-checked")).toBe("true");
    // the chip is there on the Sign row too; while it is on, a change goes to every photo
    expect(toggle("Terapkan ke semua foto").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(signs()).getByRole("radio", { name: "Polaroid" }));
    fireEvent.click(within(strip).getByRole("button", { name: "Foto 1" }));
    expect(within(signs()).getByRole("radio", { name: "Polaroid" }).getAttribute("aria-checked")).toBe("true");
    await send();
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect(compress.looks).toEqual([["polaroid", "mono"], ["polaroid", "mono"], ["polaroid", "mono"]]);
    expect(queue.added[0]).toHaveLength(3);
  });

  it("without the chip the photos keep their own looks", async () => {
    await mount();
    await pick(2);
    fireEvent.click(within(signs()).getByRole("radio", { name: "Tanda" }));
    await send();
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect(compress.looks).toEqual([["tanda", "asli"], ["tanpa", "asli"]]);
  });
});

describe("Tag orang (a bottom sheet)", () => {
  it("is not on the editor itself: the chip says Tag orang (with the count and a few avatars once people are chosen), and tapping it opens the sheet", async () => {
    await mount({ candidates: MANY, ask: false });
    await shoot();
    expect(screen.queryByRole("dialog", { name: "Tag orang" })).toBeNull();
    expect(within(editor()).queryByRole("searchbox")).toBeNull();
    expect(control("Tag orang").textContent).toBe("Tag orang");
    fireEvent.click(control("Tag orang"));
    expect(tagSheet()).toBeTruthy();
    expect(within(tagSheet()).getByRole("button", { name: "Selesai" })).toBeTruthy();
  });

  it("holds one list of everyone with BOD first and a BOD chip, avatar (photo or initials), name and department", async () => {
    await mount({ candidates: MANY, ask: false });
    await shoot();
    fireEvent.click(control("Tag orang"));
    const list = within(tagSheet()).getByRole("list", { name: "Semua orang" });
    const rows = within(list).getAllByRole("checkbox");
    expect(rows).toHaveLength(MANY.length);
    expect(rows.slice(0, 2).every(row => row.textContent?.includes("BOD"))).toBe(true);
    expect(rows.slice(2).every(row => !within(row).queryByText("BOD", { selector: "span" }))).toBe(true);
    expect(within(rows[0]).getByText("BOD", { selector: "span" })).toBeTruthy();
    expect(within(rows[2]).getByText("Finance")).toBeTruthy(); // Bima: after the BOD, by name
    expect(list.querySelector("img[src='/wam/demo/foto-01.svg']")).toBeTruthy();
    expect(within(list.querySelectorAll("li")[0] as HTMLElement).getByText("A", { selector: "span" })).toBeTruthy();
  });

  it("has no limit: more than six people can be chosen, they show as chips (tap to remove) with the count; the Tag chip and Kirim say how many", async () => {
    await mount({ candidates: MANY, ask: false });
    await shoot();
    fireEvent.click(control("Tag orang"));
    for (const box of within(within(tagSheet()).getByRole("list", { name: "Semua orang" })).getAllByRole("checkbox").slice(0, 9)) fireEvent.click(box);
    expect(within(tagSheet()).getByText("9 dipilih")).toBeTruthy();
    expect(within(within(tagSheet()).getByRole("list", { name: "Orang yang dipilih" })).getAllByRole("button")).toHaveLength(9);
    fireEvent.click(within(tagSheet()).getByRole("button", { name: "Lepas Arman" }));
    expect(within(tagSheet()).getByText("8 dipilih")).toBeTruthy();
    fireEvent.click(within(tagSheet()).getByRole("button", { name: "Selesai" }));
    expect(screen.queryByRole("list", { name: "Semua orang" })).toBeNull();
    expect(control(/^8 orang ditandai/)).toBeTruthy();
    expect(control("Kirim · 8 tag")).toBeTruthy();
    await send();
    await waitFor(() => expect(queue.added).toHaveLength(1));
    const tags = (queue.added[0][0] as QueueItem).tags!;
    expect(tags).toHaveLength(8);
    expect(new Set(tags).size).toBe(8);
    expect(tags).not.toContain(ARMAN.id);
  });

  it("every photo of a gallery pick gets the same people", async () => {
    await mount({ candidates: [SARI, BIMA], ask: false });
    await pick(2);
    fireEvent.click(control("Tag orang"));
    fireEvent.click(within(tagSheet()).getByRole("checkbox", { name: /Sari/ }));
    fireEvent.click(within(tagSheet()).getByRole("button", { name: "Selesai" }));
    expect(control("Kirim · 2 foto · 1 tag")).toBeTruthy();
    await send();
    await waitFor(() => expect(queue.added[0]).toHaveLength(2));
    expect((queue.added[0] as QueueItem[]).map(item => item.tags)).toEqual([[SARI.id], [SARI.id]]);
  });

  it("is searched by name or department over the whole list, and says when nothing matches", async () => {
    await mount({ candidates: MANY, ask: false });
    await shoot();
    fireEvent.click(control("Tag orang"));
    const search = within(tagSheet()).getByRole("searchbox", { name: "Cari nama peserta" });
    const rows = () => within(within(tagSheet()).getByRole("list", { name: "Semua orang" })).getAllByRole("checkbox");
    fireEvent.change(search, { target: { value: "hrga" } });
    expect(rows().map(row => row.textContent)).toEqual([expect.stringContaining("Sari")]);
    fireEvent.change(search, { target: { value: "bod" } });
    expect(rows()).toHaveLength(2);
    fireEvent.change(search, { target: { value: "zzzz" } });
    expect(within(tagSheet()).getByText("Tidak ada nama yang cocok.")).toBeTruthy();
    expect(within(tagSheet()).queryByRole("list", { name: "Semua orang" })).toBeNull();
  });

  it("Tanya setiap foto on (the default): the sheet opens by itself when the editor does; off: it opens only from the Tag chip (editor still opens)", async () => {
    const { unmount } = await mount({ candidates: MANY });
    await shoot();
    expect(editor()).toBeTruthy();
    expect(tagSheet()).toBeTruthy();
    fireEvent.click(within(tagSheet()).getByRole("button", { name: "Selesai" }));
    expect(screen.queryByRole("dialog", { name: "Tag orang" })).toBeNull();
    unmount();
    cleanup();
    window.localStorage.setItem("mw-momen-tag", "tidak");
    await mount({ candidates: MANY });
    await shoot();
    expect(editor()).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Tag orang" })).toBeNull();
    // the photo still goes with no tags
    await send();
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect((queue.added[0][0] as QueueItem).tags).toEqual([]);
  });

  it("the switch Tanya setiap foto sits at the top of the sheet and is remembered on this phone", async () => {
    await mount({ candidates: MANY, ask: false });
    await shoot();
    fireEvent.click(control("Tag orang"));
    const ask = within(tagSheet()).getByRole("switch", { name: "Tanya setiap foto" });
    expect(ask.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(ask);
    expect(window.localStorage.getItem("mw-momen-tag")).toBe("ya");
    fireEvent.click(within(tagSheet()).getByRole("switch", { name: "Tanya setiap foto" }));
    expect(window.localStorage.getItem("mw-momen-tag")).toBe("tidak");
  });
});

describe("Simpan asli di HP", () => {
  it("is a toggle in the top bar, on by default (pressed); turned off it is remembered on this phone", async () => {
    await mount();
    await shoot();
    expect(control("Simpan asli di HP").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(control("Simpan asli di HP"));
    expect(window.localStorage.getItem("mw-momen-asli")).toBe("tidak");
    expect(control("Simpan asli di HP").getAttribute("aria-pressed")).toBe("false");
    cleanup();
    await mount();
    await shoot();
    expect(control("Simpan asli di HP").getAttribute("aria-pressed")).toBe("false");
  });

  it("saves the plain capture (no sign, no filter) to the phone when Kirim is pressed, and the original is not what is uploaded", async () => {
    await mount();
    await shoot();
    fireEvent.click(within(signs()).getByRole("radio", { name: "Bingkai" }));
    expect(saved.files).toEqual([]);
    await send();
    await waitFor(() => expect(saved.files).toHaveLength(1));
    expect(saved.files[0].name).toMatch(/^wam-momen-\d{8}-\d{6}\.jpg$/);
    expect(saved.files[0].type).toBe("image/jpeg");
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect(compress.looks).toEqual([["bingkai", "asli"]]);
  });

  it("is not saved when it is off", async () => {
    window.localStorage.setItem("mw-momen-asli", "tidak");
    await mount();
    await shoot();
    await send();
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect(saved.files).toEqual([]);
  });

  it("is not saved for pictures picked from the gallery (they live on the phone already): the toggle is hidden", async () => {
    await mount();
    await pick(2);
    expect(within(editor()).queryByRole("button", { name: "Simpan asli di HP" })).toBeNull();
    await send();
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect(saved.files).toEqual([]);
  });

  it("a failed save says so calmly and never blocks the sending", async () => {
    saved.fail = true;
    await mount();
    await shoot();
    await send();
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect(await screen.findByText("Foto asli belum bisa disimpan di HP. Fotomu tetap terkirim.")).toBeTruthy();
  });
});

describe("Ulangi", () => {
  it("the back arrow (Ulangi) drops the photo and goes back to the camera: nothing is sent or saved", async () => {
    await mount();
    await shoot();
    await act(async () => { fireEvent.click(control("Ulangi, kembali ke kamera")); });
    expect(screen.queryByRole("dialog", { name: "Foto baru" })).toBeNull();
    expect(screen.getByRole("button", { name: /Ambil foto/ })).toBeTruthy();
    expect(queue.added).toEqual([]);
    expect(saved.files).toEqual([]);
    expect(push).not.toHaveBeenCalled();
    await shoot();
    expect(editor()).toBeTruthy();
  });

  it("Esc is Ulangi too", async () => {
    await mount();
    await shoot();
    await act(async () => { fireEvent.keyDown(editor(), { key: "Escape" }); });
    expect(screen.queryByRole("dialog", { name: "Foto baru" })).toBeNull();
    expect(queue.added).toEqual([]);
  });
});

describe("the unchanged parts", () => {
  it("after Kirim the toast still says it went, with Batalkan", async () => {
    await mount();
    await shoot();
    await send();
    expect(await screen.findByRole("button", { name: "Batalkan" })).toBeTruthy();
    expect(screen.getByText(/Terkirim/)).toBeTruthy();
  });
});
