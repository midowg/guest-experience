import axe from "axe-core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { LangProvider } from "@/components/main-wam/i18n";
import { setActiveLang } from "@/lib/main-wam/i18n";
import { misiDetectApi } from "@/lib/main-wam/misi/detect-routes";
import type { TagCandidate } from "@/lib/main-wam/misi/rules";
import type { QueueItem } from "@/lib/main-wam/momen/queue";
import { sampleSessions } from "@/lib/main-wam/sample";
import { mainWamPath } from "@/lib/routes";
import { ToastProvider } from "@/components/main-wam/ui";

/*
 * The Momen camera's two optional extras (docs/main-wam/KONTRAK.md §13): "Ada siapa di foto ini?" after the shutter (skippable) and
 * "Tandai lokasi" (off until the browser allows it, on with a clear sign when it already does, off for one photo with one tap), and the
 * toast that says what detection found: "Fotomu otomatis diajukan ..." with Tarik, or a suggestion with Ajukan.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push, back: vi.fn(), refresh: vi.fn() }), usePathname: () => "/wam2026/momen/kamera" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/components/main-wam/theme/font", () => ({ mainWamFontVars: "" }));
// A phone's camera is not in jsdom: a shot is three small blobs.
vi.mock("./upload/compress", () => {
  const blob = (text: string) => Object.assign(new Blob([text]), { arrayBuffer: async () => new ArrayBuffer(text.length) });
  return {
    PhotoProblem: class extends Error {},
    decodeFile: async () => ({ source: {}, width: 1200, height: 1500, close: () => undefined }),
    grabFrame: async () => ({ source: {}, width: 1200, height: 1500, close: () => undefined }),
    prepareInTurn: <T,>(work: () => Promise<T>) => work(),
    prepareMomenPhoto: async () => ({ besar: blob("b"), kecil: blob("k"), ubin: blob("u"), width: 1200, height: 1500 }),
  };
});
const queue = vi.hoisted(() => ({ added: [] as unknown[][], cancelled: [] as string[], sent: "photo-1" as string | null }));
vi.mock("./upload/sender", () => ({
  momenQueue: () => ({
    add: async (items: unknown[]) => { queue.added.push(items); }, cancel: async (id: string) => { queue.cancelled.push(id); },
    sentId: async () => queue.sent, onEvent: () => () => undefined, snapshot: () => ({ items: [], summary: { waiting: 0, offline: false } }), subscribe: () => () => undefined,
  }),
}));
vi.mock("./upload/QueueRunner", () => ({ MomenQueueRunner: () => null, useMomenQueue: () => ({ summary: { waiting: 0, offline: false }, items: [] }) }));
const request = vi.hoisted(() => vi.fn());
vi.mock("@/components/main-wam/misi/request", () => ({ misiRequest: request, errorText: () => "Gagal." }));

const { CameraScreen } = await import("./CameraScreen");

const SARI: TagCandidate = { id: "22222222-2222-4222-8222-222222222222", name: "Sari", department: "HRGA", bod: false, seatmate: false, roommate: true };
const BIMA: TagCandidate = { id: "33333333-3333-4333-8333-333333333333", name: "Bima", department: "Finance", bod: false, seatmate: false, roommate: false };
const GEO = { latitude: -7.88, longitude: 112.52, accuracy: 12 };

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  window.matchMedia = window.matchMedia ?? ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as never;
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  URL.createObjectURL = () => "blob:foto";
  URL.revokeObjectURL = () => undefined;
});
let watchers: { ok: (position: GeolocationPosition) => void; fail: (error: GeolocationPositionError) => void }[] = [];
const cleared = vi.fn();
function geolocation(permission: PermissionState) {
  watchers = [];
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
    watchPosition: (ok: PositionCallback, fail: PositionErrorCallback) => { watchers.push({ ok, fail: fail as never }); return watchers.length; }, clearWatch: cleared,
  } });
  Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async ({ name }: { name: string }) => ({ state: name === "geolocation" ? permission : "prompt" }) } });
}
const fix = (at = 0) => act(async () => { watchers.forEach(watcher => watcher.ok({ coords: { latitude: GEO.latitude, longitude: GEO.longitude, accuracy: GEO.accuracy }, timestamp: at } as GeolocationPosition)); });
beforeEach(() => { queue.added = []; queue.cancelled = []; queue.sent = "photo-1"; push.mockClear(); request.mockReset(); cleared.mockClear(); window.localStorage.clear(); window.localStorage.setItem("mw-momen-kamera", "izin"); geolocation("prompt"); });
afterEach(() => { cleanup(); setActiveLang("id"); vi.useRealTimers(); });

const camera = (props: { candidates?: TagCandidate[]; detect?: boolean; demo?: Parameters<typeof CameraScreen>[0]["demo"] }) => <LangProvider lang="id"><ToastProvider>
  <CameraScreen sessions={sampleSessions} nowIso="2027-01-05T15:20:00+07:00" absen migrated initialSession={null} demo={props.demo} candidates={props.candidates ?? []} detect={props.detect ?? false} />
</ToastProvider></LangProvider>;
const shoot = async () => {
  const input = document.querySelector<HTMLInputElement>("input[type=file][capture]")!;
  await act(async () => { fireEvent.change(input, { target: { files: [new File(["x"], "foto.jpg", { type: "image/jpeg" })] } }); });
};

describe("the two extras in the camera", () => {
  it("show nothing when there is nothing to tag and no mission takes detection", () => {
    render(camera({ demo: { phase: "kamera", live: "hp" } }));
    expect(screen.queryByRole("group", { name: "Pilihan untuk misi" })).toBeNull();
  });

  it("offer Tag teman (on) and Tandai lokasi (off until the browser allows it)", () => {
    render(camera({ candidates: [SARI], detect: true, demo: { phase: "kamera", live: "hp", geo: "mati" } }));
    const options = screen.getByRole("group", { name: "Pilihan untuk misi" });
    expect(within(options).getByRole("button", { name: "Tag teman" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(options).getByRole("button", { name: "Tandai lokasi" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText(/Lokasi hanya untuk/)).toBeNull();
  });

  it("when the browser already allows the location it starts on with a clear sign and a note about who sees it, and one tap turns it off", async () => {
    geolocation("granted");
    render(camera({ candidates: [SARI], detect: true }));
    // The camera is waiting for its first paint of the state read from the browser.
    const chip = await screen.findByRole("button", { name: "Lokasi aktif" });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Lokasi hanya untuk mencocokkan misi. Tidak terlihat peserta lain, dan dihapus bersama fotomu.")).toBeTruthy();
    fireEvent.click(chip);
    expect(screen.getByRole("button", { name: "Tandai lokasi" }).getAttribute("aria-pressed")).toBe("false");
    expect(cleared).toHaveBeenCalled();
    expect(screen.queryByText(/Lokasi hanya untuk/)).toBeNull();
    expect(window.localStorage.getItem("mw-momen-lokasi")).toBe("mati");
  });

  it("says plainly when the browser blocks the location, and the photo goes without it", async () => {
    geolocation("denied");
    render(camera({ candidates: [], detect: true, demo: undefined }));
    const chip = await screen.findByRole("button", { name: "Izin lokasi ditolak" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/Izin lokasi ditolak di peramban ini/)).toBeTruthy();
  });

  it("turning the location on asks the browser then, from the tap", async () => {
    render(camera({ candidates: [SARI], detect: true }));
    await act(async () => undefined);
    expect(watchers).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Tandai lokasi" }));
    expect(watchers).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Lokasi aktif" })).toBeTruthy();
  });
});

describe("the tag step after the shutter", () => {
  it("asks 'Ada siapa di foto ini?' with the suggestions first, and sends the photo with the people chosen", async () => {
    render(camera({ candidates: [BIMA, SARI], detect: false, demo: { phase: "kamera", live: "hp" } }));
    await shoot();
    const sheet = screen.getByRole("dialog", { name: "Ada siapa di foto ini?" });
    expect(queue.added).toEqual([]);
    expect(within(sheet).getByText("Boleh dilewati. Orang yang kamu tandai mendapat pemberitahuan dan bisa melepas tag.")).toBeTruthy();
    const names = within(sheet).getAllByRole("button", { pressed: false }).map(button => button.getAttribute("aria-label")).filter(Boolean);
    expect(names.indexOf("Pilih Sari")).toBeLessThan(names.indexOf("Pilih Bima"));
    expect(within(sheet).getByText("Sekamar")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Pilih Sari" }));
    expect(within(sheet).getByText("1 dari 6 dipilih")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Kirim · 1 tag" }));
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect((queue.added[0][0] as QueueItem).tags).toEqual([SARI.id]);
    expect((queue.added[0][0] as QueueItem).gallery).toBe(false);
  });

  it("is skippable: Lewati sends the photo as it is", async () => {
    render(camera({ candidates: [SARI], demo: { phase: "kamera", live: "hp" } }));
    await shoot();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Ada siapa di foto ini?" })).getByRole("button", { name: "Lewati" }));
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect((queue.added[0][0] as QueueItem).tags).toEqual([]);
  });

  it("leaving the screen with the step open still sends the photo (nothing is lost)", async () => {
    const { unmount } = render(camera({ candidates: [SARI], demo: { phase: "kamera", live: "hp" } }));
    await shoot();
    expect(queue.added).toEqual([]);
    unmount();
    expect(queue.added).toHaveLength(1);
  });

  it("turned off, the photo goes at once, and the choice is remembered on this phone", async () => {
    render(camera({ candidates: [SARI], demo: { phase: "kamera", live: "hp" } }));
    fireEvent.click(screen.getByRole("button", { name: "Tag teman" }));
    expect(screen.getByRole("button", { name: "Tag teman" }).getAttribute("aria-pressed")).toBe("false");
    expect(window.localStorage.getItem("mw-momen-tag")).toBe("tidak");
    await shoot();
    expect(screen.queryByRole("dialog", { name: "Ada siapa di foto ini?" })).toBeNull();
    await waitFor(() => expect(queue.added).toHaveLength(1));
  });

  it("is not asked for a picture picked from the gallery, which is marked as one and carries no position", async () => {
    geolocation("granted");
    render(camera({ candidates: [SARI], detect: true, demo: { phase: "kamera", live: "hp" } }));
    const picker = document.querySelector<HTMLInputElement>("input[type=file][multiple]")!;
    await act(async () => { fireEvent.change(picker, { target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] } }); });
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect(screen.queryByRole("dialog", { name: "Ada siapa di foto ini?" })).toBeNull();
    expect(queue.added[0][0]).toMatchObject({ gallery: true, geo: null });
  });

  it("puts the position of the moment of the photo on it only while Tandai lokasi is on", async () => {
    geolocation("granted");
    render(camera({ candidates: [], detect: true, demo: undefined }));
    await screen.findByRole("button", { name: "Lokasi aktif" });
    await fix(Date.now());
    await shoot();
    await waitFor(() => expect(queue.added).toHaveLength(1));
    expect((queue.added[0][0] as QueueItem).geo).toEqual(GEO);
    fireEvent.click(screen.getByRole("button", { name: "Lokasi aktif" }));
    await shoot();
    await waitFor(() => expect(queue.added).toHaveLength(2));
    expect((queue.added[1][0] as QueueItem).geo).toBeNull();
  });
});

describe("what detection found, told after the photo is sent", () => {
  const found = (extra: object) => ({ pending: false, items: [{ photoId: "photo-1", missionId: "m-1", title: "Selfie dengan teman sekamar", points: 400, outcome: "diajukan", status: "cocok", state: "review", canTakeBack: true, ...extra }] });
  async function sendAndWait(answer: unknown) {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    request.mockResolvedValue({ data: answer, message: "" });
    render(camera({ candidates: [], detect: true, demo: { phase: "kamera", live: "hp" } }));
    await shoot();
    await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
  }

  it("a photo sent by itself: the toast says which mission and the points, with Tarik and a link to Misi", async () => {
    await sendAndWait(found({}));
    expect(request).toHaveBeenCalledWith(misiDetectApi.ofPhoto("photo-1"));
    expect(screen.getByText("Fotomu otomatis diajukan untuk misi Selfie dengan teman sekamar")).toBeTruthy();
    expect(screen.getByText("+400 poin · menunggu pemeriksaan")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tarik" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lihat Misi" }));
    expect(push).toHaveBeenCalledWith(mainWamPath.missions);
  });

  it("Tarik takes the proof back (the photo stays in Momen)", async () => {
    await sendAndWait(found({}));
    request.mockResolvedValue({ data: null, message: "" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Tarik" })); });
    expect(request).toHaveBeenLastCalledWith(misiDetectApi.takeBack("m-1"), { method: "DELETE" });
    expect(screen.getByText("Pengajuan ditarik. Fotomu tetap di Momen.")).toBeTruthy();
  });

  it("a suggestion (the person's switch is off) offers Ajukan instead", async () => {
    await sendAndWait(found({ outcome: "saran", canTakeBack: false, state: "todo" }));
    expect(screen.getByText("Fotomu cocok untuk misi Selfie dengan teman sekamar")).toBeTruthy();
    request.mockResolvedValue({ data: null, message: "" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Ajukan" })); });
    expect(request).toHaveBeenLastCalledWith(misiDetectApi.submit("m-1"), { method: "POST", json: { photoId: "photo-1" } });
    expect(screen.getByText("Fotomu diajukan.")).toBeTruthy();
  });

  it("says nothing when no mission was found", async () => {
    await sendAndWait({ pending: false, items: [] });
    expect(screen.queryByText(/Fotomu/)).toBeNull();
  });

  it("asks again while the server is still looking (it waits for the photo to show to others), and gives up on a failure without a word", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    request.mockResolvedValueOnce({ data: { pending: true, items: [] }, message: "" }).mockResolvedValue({ data: found({}), message: "" });
    render(camera({ candidates: [], detect: true, demo: { phase: "kamera", live: "hp" } }));
    await shoot();
    await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
    expect(screen.queryByText(/Fotomu otomatis/)).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(6500); });
    expect(request).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Fotomu otomatis diajukan untuk misi Selfie dengan teman sekamar")).toBeTruthy();
    cleanup();
    request.mockReset(); request.mockRejectedValue(new Error("offline"));
    render(camera({ candidates: [], detect: true, demo: { phase: "kamera", live: "hp" } }));
    await shoot();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Fotomu/)).toBeNull();
  });

  it("does not ask at all when no mission takes detection", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    render(camera({ candidates: [], detect: false, demo: { phase: "kamera", live: "hp" } }));
    await shoot();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(request).not.toHaveBeenCalled();
  });
});

describe("accessibility", () => {
  const violations = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map(item => `${item.id}: ${item.nodes.map(node => node.html.slice(0, 120)).join(" | ")}`);

  it("the options row and the tag step have no violation, in Indonesian and English", async () => {
    const { unmount } = render(camera({ candidates: [SARI, BIMA], detect: true, demo: { phase: "kamera", live: "hp", geo: "aktif", sheet: "tag" } }));
    expect(await violations()).toEqual([]);
    unmount();
    setActiveLang("en");
    render(<LangProvider lang="en"><ToastProvider><CameraScreen sessions={sampleSessions} nowIso="2027-01-05T15:20:00+07:00" absen migrated initialSession={null} candidates={[SARI, BIMA]} detect demo={{ phase: "kamera", live: "hp", geo: "ditolak", sheet: "tag" }} /></ToastProvider></LangProvider>);
    expect(screen.getByRole("dialog", { name: "Who is in this photo?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Location blocked" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tag friends" })).toBeTruthy();
    expect(await violations()).toEqual([]);
  });
});
