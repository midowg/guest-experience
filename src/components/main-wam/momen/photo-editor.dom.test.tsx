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
 * "Periksa fotomu" (docs/main-wam/KONTRAK.md §40): the editor between the shutter and Kirim, drawn to fit one screen: a compact top bar (back = Ulangi, ✕ = Batal),
 * the photo, ONE row of tools (Sign, Warna, Tag, Lokasi, Simpan asli) with ONE small panel, and Kirim alone at the bottom. It opens at once, shows the sign and the
 * tone live over the plain picture, draws them only at Kirim, applies a look to all photos on request, tags people without a limit in a bottom sheet (a search,
 * BOD chips; "Tanya setiap foto" opens it by itself), and keeps the original on the phone (not for gallery pictures).
 */

const push = vi.fn();
const back = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push, back, refresh: vi.fn() }), usePathname: () => "/wam2026/momen/kamera" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/components/main-wam/theme/font", () => ({ mainWamFontVars: "" }));
const compress = vi.hoisted(() => ({ looks: [] as [string | undefined, string | undefined][], frame: null as null | (() => Promise<File>) }));
vi.mock("./upload/compress", () => {
  const blob = (text: string) => Object.assign(new Blob([text]), { arrayBuffer: async () => new ArrayBuffer(text.length) });
  return {
    PhotoProblem: class extends Error {},
    decodeFile: async () => ({ source: {}, width: 1200, height: 1500, close: () => undefined }),
    frameFile: () => (compress.frame ? compress.frame() : Promise.resolve(new File(["x"], "momen.jpg", { type: "image/jpeg" }))),
    applyLook: async (picture: unknown, sign?: string, tone?: string) => { compress.looks.push([sign, tone]); return picture; },
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
beforeEach(() => { queue.added = []; saved.files = []; saved.fail = false; compress.looks = []; compress.frame = null; push.mockClear(); back.mockClear(); window.localStorage.clear(); window.localStorage.setItem("mw-momen-kamera", "izin"); });
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
const editor = () => screen.getByRole("dialog", { name: "Periksa fotomu" });
const tool = (name: string | RegExp) => within(editor()).getByRole("button", { name });
const send = async () => { await act(async () => { fireEvent.click(tool(/^Kirim/)); }); };
const tagSheet = () => screen.getByRole("dialog", { name: "Tag orang" });
/** The photo itself (the big one): its picture and the sign drawn over it. */
const frame = () => document.querySelector("[data-momen-editor] img[alt^='Pratinjau']") as HTMLImageElement;
/** The sign over the current picture (the layer that is fading out, for a moment after a change, is under it and is not asked). */
const overlay = () => document.querySelector("[data-momen-editor] [class*='_frame_'] > span:last-child svg[data-sign]") as SVGElement | null;
const signs = () => within(editor()).getByRole("radiogroup", { name: "Sign foto" });
const tones = () => within(editor()).getByRole("radiogroup", { name: "Warna foto" });

describe("the layout", () => {
  it("is one screen: a top bar (back = Ulangi, a small title, ✕ = Batal), the photo, ONE row of tools, ONE panel, and Kirim alone at the bottom", async () => {
    await mount({ candidates: MANY, detect: true, ask: false });
    await shoot();
    const dialog = editor();
    expect(within(dialog).getByRole("heading", { name: "Periksa fotomu" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Ulangi, kembali ke kamera" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Batal" })).toBeTruthy();
    const row = within(dialog).getByRole("toolbar", { name: "Alat foto" });
    expect(within(row).getAllByRole("button").map(button => button.textContent)).toEqual(["Sign", "Warna", "Tag", "Lokasi", "Simpan asli"]);
    // only one panel at a time: Sign by default, then Warna instead of it
    expect(within(dialog).getAllByRole("radiogroup")).toHaveLength(1);
    expect(within(row).getByRole("button", { name: "Sign" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(within(row).getByRole("button", { name: "Warna" }));
    expect(within(dialog).getAllByRole("radiogroup")).toHaveLength(1);
    expect(tones()).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Warna" }).getAttribute("aria-expanded")).toBe("true");
    expect(within(row).getByRole("button", { name: "Sign" }).getAttribute("aria-expanded")).toBe("false");
    // no long explanations and no other button at the bottom than Kirim (one photo: no counter, no strip, no "Terapkan ke semua foto")
    expect(within(dialog).queryByText(/Salinan asli|Lokasi hanya|Dilipat|Orang yang kamu tandai/)).toBeNull();
    expect(within(dialog).queryByText("Terapkan ke semua foto")).toBeNull();
    expect(within(dialog).queryByRole("group", { name: "Foto yang akan dikirim" })).toBeNull();
    expect(within(dialog).queryByText("Batal")).toBeNull();
    expect(within(dialog).queryByText("Ulangi")).toBeNull();
    expect(within(dialog).getAllByRole("button").filter(button => /^Kirim/.test(button.textContent ?? ""))).toHaveLength(1);
  });

  it("the Sign panel shows the same photo with each sign (a tile and its name), the Warna panel the same photo in each tone", async () => {
    await mount();
    await shoot();
    const names = (group: HTMLElement) => within(group).getAllByRole("radio").map(radio => radio.querySelector("[class*='_tileName_']")!.textContent);
    expect(names(signs())).toEqual(["Tanpa", "Simpel", "Emas", "Jaringan", "Polaroid"]);
    expect(within(signs()).getAllByRole("radio").map(radio => radio.querySelector("svg[data-sign]")?.getAttribute("data-sign") ?? null)).toEqual([null, "simpel", "emas", "jaringan", "polaroid"]);
    expect(within(signs()).getAllByRole("radio").every(radio => radio.querySelector("img"))).toBe(true);
    fireEvent.click(tool("Warna"));
    expect(names(tones())).toEqual(["Asli", "Emas", "Fajar", "Mono"]);
    expect(within(tones()).getAllByRole("radio").map(radio => (radio.querySelector("img") as HTMLImageElement).style.filter)).toEqual(["none", expect.stringContaining("sepia(0.3)"), expect.stringContaining("saturate(0.95)"), expect.stringContaining("grayscale(1)")]);
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
    expect((within(editor()).getByRole("button", { name: "Menunggu foto" }) as HTMLButtonElement).disabled).toBe(true);
    expect(queue.added).toEqual([]);
    await act(async () => { finish(file()); });
    expect(within(editor()).getByRole("button", { name: "Kirim" })).toBeTruthy();
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
    expect(tool("Kirim · 3 foto")).toBeTruthy();
  });

  it("nothing is sent until Kirim", async () => {
    await mount();
    await shoot();
    expect(queue.added).toEqual([]);
  });

  it("a file that is not a photo is left out with the reason, and the editor does not open when none is left", async () => {
    await mount();
    await act(async () => { fireEvent.change(document.querySelector<HTMLInputElement>("input[type=file][multiple]")!, { target: { files: [new File(["x"], "a.pdf", { type: "application/pdf" })] } }); });
    expect(screen.queryByRole("dialog", { name: "Periksa fotomu" })).toBeNull();
    expect(screen.getByText("Pilih foto JPG, PNG, WebP, atau HEIC.")).toBeTruthy();
  });
});

describe("sign and colour", () => {
  it("start as Tanpa and Asli with nothing drawn; a sign and a tone change the preview apart and combine, over the plain picture", async () => {
    await mount();
    await shoot();
    expect(within(signs()).getByRole("radio", { name: "Tanpa" }).getAttribute("aria-checked")).toBe("true");
    expect(overlay()).toBeNull();
    expect(frame().style.filter).toBe("none");
    fireEvent.click(within(signs()).getByRole("radio", { name: "Polaroid" }));
    expect(overlay()!.getAttribute("data-sign")).toBe("polaroid");
    expect(overlay()!.getAttribute("viewBox")).toBe("0 0 400 500");
    expect(overlay()!.textContent).toContain("WERKUDARA ANNUAL MEETING 2026");
    expect(frame().style.filter).toBe("none");
    fireEvent.click(tool("Warna"));
    expect(within(tones()).getByRole("radio", { name: "Asli" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(tones()).getByRole("radio", { name: "Emas" }));
    expect(frame().style.filter).toContain("sepia(0.3)");
    expect(overlay()!.getAttribute("data-sign")).toBe("polaroid");
    expect(overlay()!.getAttribute("style") ?? "").not.toMatch(/filter/);
    fireEvent.click(tool("Sign"));
    fireEvent.click(within(signs()).getByRole("radio", { name: "Simpel" }));
    expect(overlay()!.getAttribute("data-sign")).toBe("simpel");
    expect(overlay()!.textContent).toContain("WAM 2026 · Kota Batu · 5–8 Jan 2027");
    fireEvent.click(within(signs()).getByRole("radio", { name: "Tanpa" }));
    fireEvent.click(tool("Warna"));
    fireEvent.click(within(tones()).getByRole("radio", { name: "Asli" }));
    expect(overlay()).toBeNull();
    expect(frame().style.filter).toBe("none");
  });

  it("are drawn only when Kirim is pressed (tone first, then the sign), and the queue gets the result", async () => {
    await mount();
    await shoot();
    fireEvent.click(within(signs()).getByRole("radio", { name: "Jaringan" }));
    fireEvent.click(tool("Warna"));
    fireEvent.click(within(tones()).getByRole("radio", { name: "Mono" }));
    expect(compress.looks).toEqual([]);
    await send();
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect(compress.looks).toEqual([["jaringan", "mono"]]);
    expect(screen.queryByRole("dialog", { name: "Periksa fotomu" })).toBeNull();
  });

  it("with several photos the change goes to the chosen photo only; the chip Terapkan ke semua foto (in the panel) copies it to all and keeps applying", async () => {
    await mount();
    await pick(3);
    const strip = within(editor()).getByRole("group", { name: "Foto yang akan dikirim" });
    fireEvent.click(within(signs()).getByRole("radio", { name: "Emas" }));
    fireEvent.click(within(strip).getByRole("button", { name: "Foto 2" }));
    expect(within(editor()).getByText("2/3")).toBeTruthy();
    expect(within(signs()).getByRole("radio", { name: "Tanpa" }).getAttribute("aria-checked")).toBe("true");
    expect(overlay()).toBeNull();
    fireEvent.click(tool("Warna"));
    fireEvent.click(within(tones()).getByRole("radio", { name: "Mono" }));
    const all = within(editor()).getByRole("switch", { name: "Terapkan ke semua foto" });
    expect(all.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(all);
    expect(all.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(strip).getByRole("button", { name: "Foto 3" }));
    expect(within(tones()).getByRole("radio", { name: "Mono" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(tool("Sign"));
    expect(within(signs()).getByRole("radio", { name: "Tanpa" }).getAttribute("aria-checked")).toBe("true");
    // the chip is in the Sign panel too; while it is on, a change goes to every photo
    expect(within(editor()).getByRole("switch", { name: "Terapkan ke semua foto" }).getAttribute("aria-checked")).toBe("true");
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
    fireEvent.click(within(signs()).getByRole("radio", { name: "Simpel" }));
    await send();
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect(compress.looks).toEqual([["simpel", "asli"], ["tanpa", "asli"]]);
  });
});

describe("Tag orang (a bottom sheet)", () => {
  it("is not on the editor itself: the Tag tool shows only a count, and tapping it opens the sheet", async () => {
    await mount({ candidates: MANY, ask: false });
    await shoot();
    expect(screen.queryByRole("dialog", { name: "Tag orang" })).toBeNull();
    expect(within(editor()).queryByRole("searchbox")).toBeNull();
    expect(tool("Tag orang").textContent).toBe("Tag");
    fireEvent.click(tool("Tag orang"));
    expect(tagSheet()).toBeTruthy();
    expect(within(tagSheet()).getByRole("button", { name: "Selesai" })).toBeTruthy();
  });

  it("holds one list of everyone with BOD first and a BOD chip, avatar (photo or initials), name and department", async () => {
    await mount({ candidates: MANY, ask: false });
    await shoot();
    fireEvent.click(tool("Tag orang"));
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

  it("has no limit: more than six people can be chosen, they show as chips (tap to remove) with the count; the tool and Kirim say how many", async () => {
    await mount({ candidates: MANY, ask: false });
    await shoot();
    fireEvent.click(tool("Tag orang"));
    for (const box of within(within(tagSheet()).getByRole("list", { name: "Semua orang" })).getAllByRole("checkbox").slice(0, 9)) fireEvent.click(box);
    expect(within(tagSheet()).getByText("9 dipilih")).toBeTruthy();
    expect(within(within(tagSheet()).getByRole("list", { name: "Orang yang dipilih" })).getAllByRole("button")).toHaveLength(9);
    fireEvent.click(within(tagSheet()).getByRole("button", { name: "Lepas Arman" }));
    expect(within(tagSheet()).getByText("8 dipilih")).toBeTruthy();
    fireEvent.click(within(tagSheet()).getByRole("button", { name: "Selesai" }));
    expect(screen.queryByRole("list", { name: "Semua orang" })).toBeNull();
    expect(tool("Tag orang, 8 dipilih").textContent).toContain("8");
    expect(tool("Kirim · 8 tag")).toBeTruthy();
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
    fireEvent.click(tool("Tag orang"));
    fireEvent.click(within(tagSheet()).getByRole("checkbox", { name: /Sari/ }));
    fireEvent.click(within(tagSheet()).getByRole("button", { name: "Selesai" }));
    expect(tool("Kirim · 2 foto · 1 tag")).toBeTruthy();
    await send();
    await waitFor(() => expect(queue.added[0]).toHaveLength(2));
    expect((queue.added[0] as QueueItem[]).map(item => item.tags)).toEqual([[SARI.id], [SARI.id]]);
  });

  it("is searched by name or department over the whole list, and says when nothing matches", async () => {
    await mount({ candidates: MANY, ask: false });
    await shoot();
    fireEvent.click(tool("Tag orang"));
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

  it("Tanya setiap foto on (the default): the sheet opens by itself when the editor does; off: it opens only from the Tag tool (editor still opens)", async () => {
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
    fireEvent.click(tool("Tag orang"));
    const ask = within(tagSheet()).getByRole("switch", { name: "Tanya setiap foto" });
    expect(ask.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(ask);
    expect(window.localStorage.getItem("mw-momen-tag")).toBe("ya");
    fireEvent.click(within(tagSheet()).getByRole("switch", { name: "Tanya setiap foto" }));
    expect(window.localStorage.getItem("mw-momen-tag")).toBe("tidak");
  });
});

describe("Simpan asli di HP", () => {
  it("is a toggle in the tool row, on by default; turned off it is remembered on this phone, and a one-line note says what it does when it is turned on", async () => {
    await mount();
    await shoot();
    expect(tool("Simpan asli di HP").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(tool("Simpan asli di HP"));
    expect(window.localStorage.getItem("mw-momen-asli")).toBe("tidak");
    expect(tool("Simpan asli di HP").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(tool("Simpan asli di HP"));
    expect(within(editor()).getByRole("status").textContent).toBe("Salinan asli (tanpa sign dan warna) disimpan di HP-mu.");
    fireEvent.click(tool("Simpan asli di HP"));
    cleanup();
    await mount();
    await shoot();
    expect(tool("Simpan asli di HP").getAttribute("aria-pressed")).toBe("false");
  });

  it("saves the plain capture (no sign, no colour) to the phone when Kirim is pressed, and the original is not what is uploaded", async () => {
    await mount();
    await shoot();
    fireEvent.click(within(signs()).getByRole("radio", { name: "Emas" }));
    expect(saved.files).toEqual([]);
    await send();
    await waitFor(() => expect(saved.files).toHaveLength(1));
    expect(saved.files[0].name).toMatch(/^wam-momen-\d{8}-\d{6}\.jpg$/);
    expect(saved.files[0].type).toBe("image/jpeg");
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect(compress.looks).toEqual([["emas", "asli"]]);
  });

  it("is not saved when it is off", async () => {
    window.localStorage.setItem("mw-momen-asli", "tidak");
    await mount();
    await shoot();
    await send();
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect(saved.files).toEqual([]);
  });

  it("is not saved for pictures picked from the gallery (they live on the phone already): the tool is hidden", async () => {
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

describe("Ulangi and Batal", () => {
  it("the back arrow (Ulangi) drops the photo and goes back to the camera: nothing is sent or saved", async () => {
    await mount();
    await shoot();
    await act(async () => { fireEvent.click(tool("Ulangi, kembali ke kamera")); });
    expect(screen.queryByRole("dialog", { name: "Periksa fotomu" })).toBeNull();
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
    expect(screen.queryByRole("dialog", { name: "Periksa fotomu" })).toBeNull();
    expect(queue.added).toEqual([]);
  });

  it("✕ (Batal) leaves the camera (to Momen) with nothing sent or saved", async () => {
    await mount();
    await shoot();
    await act(async () => { fireEvent.click(tool("Batal")); });
    expect(screen.queryByRole("dialog", { name: "Periksa fotomu" })).toBeNull();
    // back to where the camera was opened from (Momen when there is no history to go back to)
    expect(back.mock.calls.length + push.mock.calls.filter(call => call[0] === mainWamPath.moments()).length).toBe(1);
    expect(queue.added).toEqual([]);
    expect(saved.files).toEqual([]);
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
