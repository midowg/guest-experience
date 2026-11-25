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
 * "Periksa fotomu" (docs/main-wam/KONTRAK.md §38): the editor between the shutter and Kirim. It opens at once, shows the sign and the tone live over the
 * plain picture, draws them only at Kirim, applies a look to all photos on request, tags people without a limit (a search, BOD chips), folds the tag
 * block when "Tanya setiap foto" is off, keeps the original on the phone (not for gallery pictures) and gives Ulangi and Batal.
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

/** `stored`: not a preview, so what this phone chose before (browser storage) is read. */
const camera = (props: { candidates?: TagCandidate[]; detect?: boolean; stored?: boolean } = {}) => <LangProvider lang="id"><ToastProvider>
  <CameraScreen sessions={sampleSessions} nowIso="2027-01-05T15:20:00+07:00" absen migrated initialSession={null} demo={props.stored ? undefined : { phase: "kamera", live: "hp" }} candidates={props.candidates ?? []} detect={props.detect ?? false} />
</ToastProvider></LangProvider>;
const file = (name = "foto.jpg") => new File(["x"], name, { type: "image/jpeg" });
const shoot = async () => { await act(async () => { fireEvent.change(document.querySelector<HTMLInputElement>("input[type=file][capture]")!, { target: { files: [file()] } }); }); };
const pick = async (count: number) => { await act(async () => { fireEvent.change(document.querySelector<HTMLInputElement>("input[type=file][multiple]")!, { target: { files: Array.from({ length: count }, (_, index) => file(`g${index}.jpg`)) } }); }); };
const editor = () => screen.getByRole("dialog", { name: "Periksa fotomu" });
const send = async () => { await act(async () => { fireEvent.click(within(editor()).getByRole("button", { name: /^Kirim/ })); }); };
const frame = (container: HTMLElement) => container.querySelector("[data-momen-editor] img[alt^='Pratinjau']") as HTMLImageElement;

describe("opening", () => {
  it("opens at once after a shot with Kirim waiting for the frame: a skeleton, then the photo (the camera captured the plain frame)", async () => {
    let finish: (value: File) => void = () => undefined;
    compress.frame = () => new Promise<File>(resolve => { finish = resolve; });
    // A live viewfinder: a stream the shutter can read.
    const track = { stop: vi.fn() };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [track] }) } });
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "granted" }) } });
    HTMLMediaElement.prototype.play = (() => Promise.resolve()) as never;
    render(<LangProvider lang="id"><ToastProvider><CameraScreen sessions={sampleSessions} nowIso="2027-01-05T15:20:00+07:00" absen migrated initialSession={null} candidates={[SARI]} /></ToastProvider></LangProvider>);
    const shutter = await screen.findByRole("button", { name: /Ambil foto/ });
    await waitFor(() => expect((shutter as HTMLButtonElement).disabled).toBe(false));
    await waitFor(() => expect(document.querySelector("video")).toBeTruthy());
    await act(async () => { fireEvent.click(shutter); });
    expect(editor()).toBeTruthy();
    expect(within(editor()).getByRole("status", { name: "Menyiapkan foto" })).toBeTruthy();
    const kirim = within(editor()).getByRole("button", { name: "Menunggu foto" }) as HTMLButtonElement;
    expect(kirim.disabled).toBe(true);
    expect(queue.added).toEqual([]);
    await act(async () => { finish(file()); });
    expect(within(editor()).getByRole("button", { name: "Kirim" })).toBeTruthy();
    expect(within(editor()).getByRole("img", { name: "Pratinjau fotomu" })).toBeTruthy();
    expect(compress.looks).toEqual([]);
    expect(track.stop).toHaveBeenCalled(); // the camera rests while the photo is looked at
  });

  it("opens after a shot from the phone's own camera, and after a pick from the gallery (several photos: a strip and the count)", async () => {
    const { unmount } = render(camera());
    await shoot();
    expect(editor()).toBeTruthy();
    expect(within(editor()).queryByRole("group", { name: "Foto yang akan dikirim" })).toBeNull();
    unmount();
    render(camera());
    await pick(3);
    expect(within(editor()).getByText("Foto 1 dari 3")).toBeTruthy();
    expect(within(within(editor()).getByRole("group", { name: "Foto yang akan dikirim" })).getAllByRole("button")).toHaveLength(3);
    expect(within(editor()).getByRole("button", { name: "Kirim · 3 foto" })).toBeTruthy();
  });

  it("nothing is sent until Kirim", async () => {
    render(camera());
    await shoot();
    expect(queue.added).toEqual([]);
  });

  it("a file that is not a photo is left out with the reason, and the editor does not open when none is left", async () => {
    render(camera());
    await act(async () => { fireEvent.change(document.querySelector<HTMLInputElement>("input[type=file][multiple]")!, { target: { files: [new File(["x"], "a.pdf", { type: "application/pdf" })] } }); });
    expect(screen.queryByRole("dialog", { name: "Periksa fotomu" })).toBeNull();
    expect(screen.getByText("Pilih foto JPG, PNG, WebP, atau HEIC.")).toBeTruthy();
  });
});

describe("sign and colour", () => {
  it("start as Tanpa and Asli with nothing drawn; a sign and a tone change the preview apart and combine, over the plain picture", async () => {
    const { container } = render(camera());
    await shoot();
    const signs = within(editor()).getByRole("radiogroup", { name: "Sign foto" });
    const tones = within(editor()).getByRole("radiogroup", { name: "Warna foto" });
    expect(within(signs).getAllByRole("radio").map(radio => radio.textContent)).toEqual(["Tanpa", "Simpel", "Emas", "Jaringan", "Polaroid"]);
    expect(within(tones).getAllByRole("radio").map(radio => radio.textContent)).toEqual(["Asli", "Emas", "Fajar", "Mono"]);
    expect(within(signs).getByRole("radio", { name: "Tanpa" }).getAttribute("aria-checked")).toBe("true");
    expect(within(tones).getByRole("radio", { name: "Asli" }).getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector("svg[data-sign]")).toBeNull();
    expect(frame(container).style.filter).toBe("none");
    fireEvent.click(within(signs).getByRole("radio", { name: "Polaroid" }));
    const overlay = container.querySelector("svg[data-sign=polaroid]") as SVGElement;
    expect(overlay.getAttribute("viewBox")).toBe("0 0 400 500");
    expect(overlay.textContent).toContain("WERKUDARA ANNUAL MEETING 2026");
    expect(frame(container).style.filter).toBe("none");
    fireEvent.click(within(tones).getByRole("radio", { name: "Emas" }));
    expect(frame(container).style.filter).toContain("sepia(0.3)");
    expect(container.querySelector("svg[data-sign=polaroid]")).toBeTruthy();
    expect(container.querySelector("svg[data-sign]")!.getAttribute("style") ?? "").not.toMatch(/filter/);
    fireEvent.click(within(signs).getByRole("radio", { name: "Simpel" }));
    expect(container.querySelector("svg[data-sign=polaroid]")).toBeNull();
    expect((container.querySelector("svg[data-sign=simpel]") as SVGElement).textContent).toContain("WAM 2026 · Kota Batu · 4–7 Jan 2027");
    fireEvent.click(within(signs).getByRole("radio", { name: "Tanpa" }));
    fireEvent.click(within(tones).getByRole("radio", { name: "Asli" }));
    expect(container.querySelector("svg[data-sign]")).toBeNull();
    expect(frame(container).style.filter).toBe("none");
  });

  it("are drawn only when Kirim is pressed (tone first, then the sign), and the queue gets the result", async () => {
    render(camera());
    await shoot();
    fireEvent.click(within(within(editor()).getByRole("radiogroup", { name: "Sign foto" })).getByRole("radio", { name: "Jaringan" }));
    fireEvent.click(within(within(editor()).getByRole("radiogroup", { name: "Warna foto" })).getByRole("radio", { name: "Mono" }));
    expect(compress.looks).toEqual([]);
    await send();
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect(compress.looks).toEqual([["jaringan", "mono"]]);
    expect(screen.queryByRole("dialog", { name: "Periksa fotomu" })).toBeNull();
  });

  it("with several photos the change goes to the chosen photo only, and Terapkan ke semua foto copies it to all and keeps applying", async () => {
    const { container } = render(camera());
    await pick(3);
    const strip = within(editor()).getByRole("group", { name: "Foto yang akan dikirim" });
    const signs = () => within(editor()).getByRole("radiogroup", { name: "Sign foto" });
    const tones = () => within(editor()).getByRole("radiogroup", { name: "Warna foto" });
    fireEvent.click(within(signs()).getByRole("radio", { name: "Emas" }));
    fireEvent.click(within(strip).getByRole("button", { name: "Foto 2" }));
    expect(within(editor()).getByText("Foto 2 dari 3")).toBeTruthy();
    expect(within(signs()).getByRole("radio", { name: "Tanpa" }).getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector("svg[data-sign]")).toBeNull();
    fireEvent.click(within(tones()).getByRole("radio", { name: "Mono" }));
    // photo 3 has nothing; now apply photo 2's look to all
    const all = within(editor()).getByRole("switch", { name: "Terapkan ke semua foto" });
    expect(all.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(all);
    expect(all.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(strip).getByRole("button", { name: "Foto 3" }));
    expect(within(tones()).getByRole("radio", { name: "Mono" }).getAttribute("aria-checked")).toBe("true");
    expect(within(signs()).getByRole("radio", { name: "Tanpa" }).getAttribute("aria-checked")).toBe("true");
    // while it is on, a change goes to every photo
    fireEvent.click(within(signs()).getByRole("radio", { name: "Polaroid" }));
    fireEvent.click(within(strip).getByRole("button", { name: "Foto 1" }));
    expect(within(signs()).getByRole("radio", { name: "Polaroid" }).getAttribute("aria-checked")).toBe("true");
    await send();
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect(compress.looks).toEqual([["polaroid", "mono"], ["polaroid", "mono"], ["polaroid", "mono"]]);
    expect(queue.added[0]).toHaveLength(3);
  });

  it("without the switch the photos keep their own looks", async () => {
    render(camera());
    await pick(2);
    fireEvent.click(within(within(editor()).getByRole("radiogroup", { name: "Sign foto" })).getByRole("radio", { name: "Simpel" }));
    await send();
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect(compress.looks).toEqual([["simpel", "asli"], ["tanpa", "asli"]]);
  });
});

describe("tag orang", () => {
  it("is one list of everyone with BOD first and a BOD chip, avatar (photo or initials), name and department", async () => {
    render(camera({ candidates: MANY }));
    await shoot();
    const list = within(editor()).getByRole("list", { name: "Semua orang" });
    const rows = within(list).getAllByRole("checkbox");
    expect(rows).toHaveLength(MANY.length);
    expect(rows.slice(0, 2).map(row => row.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Arman"), expect.stringContaining("Wulan")]));
    expect(rows.slice(0, 2).every(row => row.textContent?.includes("BOD"))).toBe(true);
    expect(rows.slice(2).every(row => !within(row).queryByText("BOD", { selector: "span" }))).toBe(true);
    expect(within(rows[0]).getByText("BOD", { selector: "span" })).toBeTruthy();
    expect(within(rows[2]).getByText("Finance")).toBeTruthy(); // Bima: after the BOD, by name
    // a person with a photo shows it; one without has the initial
    expect(list.querySelector("img[src='/wam/demo/foto-01.svg']")).toBeTruthy();
    expect(within(list.querySelectorAll("li")[0] as HTMLElement).getByText("A", { selector: "span" })).toBeTruthy();
  });

  it("has no limit: more than six people can be chosen, they show as chips (tap to remove) with the count, and Kirim says how many", async () => {
    render(camera({ candidates: MANY }));
    await shoot();
    const list = within(editor()).getByRole("list", { name: "Semua orang" });
    const boxes = within(list).getAllByRole("checkbox");
    for (const box of boxes.slice(0, 9)) fireEvent.click(box);
    expect(within(editor()).getByText("9 dipilih")).toBeTruthy();
    expect(within(editor()).getAllByRole("checkbox", { checked: true })).toHaveLength(9);
    const chips = within(within(editor()).getByRole("list", { name: "Orang yang dipilih" })).getAllByRole("button");
    expect(chips).toHaveLength(9);
    expect(within(editor()).getByRole("button", { name: "Kirim · 9 tag" })).toBeTruthy();
    fireEvent.click(within(editor()).getByRole("button", { name: "Lepas Arman" }));
    expect(within(editor()).getByText("8 dipilih")).toBeTruthy();
    expect(within(editor()).getByRole("button", { name: "Kirim · 8 tag" })).toBeTruthy();
    await send();
    await waitFor(() => expect(queue.added).toHaveLength(1));
    const tags = (queue.added[0][0] as QueueItem).tags!;
    expect(tags).toHaveLength(8);
    expect(new Set(tags).size).toBe(8);
    expect(tags).not.toContain(ARMAN.id);
  });

  it("every photo of a gallery pick gets the same people", async () => {
    render(camera({ candidates: [SARI, BIMA] }));
    await pick(2);
    fireEvent.click(within(editor()).getByRole("checkbox", { name: /Sari/ }));
    expect(within(editor()).getByRole("button", { name: "Kirim · 2 foto · 1 tag" })).toBeTruthy();
    await send();
    await waitFor(() => expect(queue.added[0]).toHaveLength(2));
    expect((queue.added[0] as QueueItem[]).map(item => item.tags)).toEqual([[SARI.id], [SARI.id]]);
  });

  it("is searched by name or department over the whole list, and says when nothing matches", async () => {
    render(camera({ candidates: MANY }));
    await shoot();
    const search = within(editor()).getByRole("searchbox", { name: "Cari nama peserta" });
    fireEvent.change(search, { target: { value: "hrga" } });
    expect(within(within(editor()).getByRole("list", { name: "Semua orang" })).getAllByRole("checkbox").map(row => row.textContent)).toEqual([expect.stringContaining("Sari")]);
    fireEvent.change(search, { target: { value: "bod" } });
    expect(within(within(editor()).getByRole("list", { name: "Semua orang" })).getAllByRole("checkbox")).toHaveLength(2);
    fireEvent.change(search, { target: { value: "zzzz" } });
    expect(within(editor()).getByText("Tidak ada nama yang cocok.")).toBeTruthy();
    expect(within(editor()).queryByRole("list", { name: "Semua orang" })).toBeNull();
  });

  it("with Tanya setiap foto off the editor still opens, but the tag block is folded into one dashed row with Buka (and Lipat folds it back)", async () => {
    window.localStorage.setItem("mw-momen-tag", "tidak");
    render(camera({ candidates: MANY, stored: true }));
    await act(async () => undefined);
    await shoot();
    expect(editor()).toBeTruthy();
    expect(within(editor()).getByText("Tag orang")).toBeTruthy();
    expect(within(editor()).getByText(/Dilipat karena "Tanya setiap foto" mati/)).toBeTruthy();
    expect(within(editor()).queryByRole("list", { name: "Semua orang" })).toBeNull();
    expect(within(editor()).getByRole("switch", { name: "Tanya setiap foto" }).getAttribute("aria-checked")).toBe("false");
    fireEvent.click(within(editor()).getByRole("button", { name: "Buka" }));
    expect(within(editor()).getByRole("list", { name: "Semua orang" })).toBeTruthy();
    fireEvent.click(within(editor()).getByRole("button", { name: "Lipat" }));
    expect(within(editor()).queryByRole("list", { name: "Semua orang" })).toBeNull();
    // the photo still goes with no tags
    await send();
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect((queue.added[0][0] as QueueItem).tags).toEqual([]);
  });

  it("the switch Tanya setiap foto folds or opens the block at once and is remembered on this phone", async () => {
    render(camera({ candidates: MANY, stored: true }));
    await shoot();
    expect(within(editor()).getByRole("list", { name: "Semua orang" })).toBeTruthy();
    fireEvent.click(within(editor()).getByRole("switch", { name: "Tanya setiap foto" }));
    expect(window.localStorage.getItem("mw-momen-tag")).toBe("tidak");
    expect(within(editor()).queryByRole("list", { name: "Semua orang" })).toBeNull();
    fireEvent.click(within(editor()).getByRole("switch", { name: "Tanya setiap foto" }));
    expect(window.localStorage.getItem("mw-momen-tag")).toBe("ya");
    expect(within(editor()).getByRole("list", { name: "Semua orang" })).toBeTruthy();
  });
});

describe("Simpan asli di HP", () => {
  it("is on by default; turned off it is remembered on this phone", async () => {
    render(camera({ stored: true }));
    await shoot();
    const keep = within(editor()).getByRole("switch", { name: "Simpan asli di HP" });
    expect(keep.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(keep);
    expect(window.localStorage.getItem("mw-momen-asli")).toBe("tidak");
    cleanup();
    render(camera({ stored: true }));
    await act(async () => undefined);
    await shoot();
    expect(within(editor()).getByRole("switch", { name: "Simpan asli di HP" }).getAttribute("aria-checked")).toBe("false");
  });

  it("saves the plain capture (no sign, no colour) to the phone when Kirim is pressed, and the original is not what is uploaded", async () => {
    render(camera());
    await shoot();
    fireEvent.click(within(within(editor()).getByRole("radiogroup", { name: "Sign foto" })).getByRole("radio", { name: "Emas" }));
    expect(saved.files).toEqual([]);
    await send();
    await waitFor(() => expect(saved.files).toHaveLength(1));
    expect(saved.files[0].name).toMatch(/^wam-momen-\d{8}-\d{6}\.jpg$/);
    expect(saved.files[0].type).toBe("image/jpeg");
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect(compress.looks).toEqual([["emas", "asli"]]);
  });

  it("is not saved when the switch is off", async () => {
    window.localStorage.setItem("mw-momen-asli", "tidak");
    render(camera({ stored: true }));
    await act(async () => undefined);
    await shoot();
    await send();
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect(saved.files).toEqual([]);
  });

  it("is not saved for pictures picked from the gallery (they live on the phone already): no switch either", async () => {
    render(camera());
    await pick(2);
    expect(within(editor()).queryByRole("switch", { name: "Simpan asli di HP" })).toBeNull();
    await send();
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect(saved.files).toEqual([]);
  });

  it("a failed save says so calmly and never blocks the sending", async () => {
    saved.fail = true;
    render(camera());
    await shoot();
    await send();
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect(await screen.findByText("Foto asli belum bisa disimpan di HP. Fotomu tetap terkirim.")).toBeTruthy();
  });
});

describe("Ulangi and Batal", () => {
  it("Ulangi drops the photo and goes back to the camera: nothing is sent or saved", async () => {
    render(camera());
    await shoot();
    await act(async () => { fireEvent.click(within(editor()).getByRole("button", { name: "Ulangi" })); });
    expect(screen.queryByRole("dialog", { name: "Periksa fotomu" })).toBeNull();
    expect(screen.getByRole("button", { name: /Ambil foto/ })).toBeTruthy();
    expect(queue.added).toEqual([]);
    expect(saved.files).toEqual([]);
    expect(push).not.toHaveBeenCalled();
    await shoot();
    expect(editor()).toBeTruthy();
  });

  it("the back arrow at the top is Ulangi too, and so is Esc", async () => {
    render(camera());
    await shoot();
    await act(async () => { fireEvent.click(within(editor()).getByRole("button", { name: "Ulangi, kembali ke kamera" })); });
    expect(screen.queryByRole("dialog", { name: "Periksa fotomu" })).toBeNull();
    await shoot();
    await act(async () => { fireEvent.keyDown(editor(), { key: "Escape" }); });
    expect(screen.queryByRole("dialog", { name: "Periksa fotomu" })).toBeNull();
    expect(queue.added).toEqual([]);
  });

  it("Batal leaves the camera (to Momen) with nothing sent or saved", async () => {
    render(camera());
    await shoot();
    await act(async () => { fireEvent.click(within(editor()).getByRole("button", { name: "Batal" })); });
    expect(screen.queryByRole("dialog", { name: "Periksa fotomu" })).toBeNull();
    // back to where the camera was opened from (Momen when there is no history to go back to)
    expect(back.mock.calls.length + push.mock.calls.filter(call => call[0] === mainWamPath.moments()).length).toBe(1);
    expect(queue.added).toEqual([]);
    expect(saved.files).toEqual([]);
  });
});

describe("the unchanged parts", () => {
  it("after Kirim the toast still says it went, with Batalkan", async () => {
    render(camera());
    await shoot();
    await send();
    expect(await screen.findByRole("button", { name: "Batalkan" })).toBeTruthy();
    expect(screen.getByText(/Terkirim/)).toBeTruthy();
  });
});
