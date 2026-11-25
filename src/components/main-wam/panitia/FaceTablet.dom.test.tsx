import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@/components/main-wam/ui";
import { EMBEDDING_SIZE } from "@/lib/hr/face-match";
import { FACE_QUEUE_KEY, type TabletAnswer, type TabletData, type TabletFaceAnswer, type TabletRequest } from "@/lib/main-wam/panitia/face-tablet";
import type { AttendeeRow } from "@/lib/main-wam/panitia/attendance";
import { PanitiaApiContext, PanitiaError, type PanitiaApi } from "./api";
import { FaceTablet, type FaceTabletClient, type TabletEngine } from "./FaceTablet";

/*
 * Absen mode tablet as panitia uses it, with the face engine and the camera replaced: faces are
 * scripted (where they are, which numbers they have), the server's answers are the test's. Real
 * timers: the loop runs at the speed it has on a tablet.
 */

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/wam2026" }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  // A video that has a picture, a canvas that has no 2D context (the tablet then hands the engine the video itself).
  Object.defineProperty(HTMLMediaElement.prototype, "readyState", { configurable: true, get: () => 4 });
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 640 });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 480 });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 600 });
  HTMLMediaElement.prototype.play = async () => undefined;
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});
beforeEach(() => { window.localStorage.clear(); window.history.replaceState(null, "", "/wam2026"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const SESSION = "00000000-0000-4000-8000-0000000000a1";
const unit = (i: number) => Array.from({ length: EMBEDDING_SIZE }, (_, j) => (j === i ? 1 : 0));
const row = (id: string, name: string, checkedInAt: string | null = null): AttendeeRow => ({ id, name, department: "CoE", photo: null, checkedInAt, method: checkedInAt ? "manual" : null });
const ROWS = [row("a", "Sari"), row("b", "Budi"), row("c", "Nina")];
const session = { id: SESSION, title: "Pemaparan departemen", time: "08.00–12.00", day: "Sel, 5 Jan", required: true, opens: "2027-01-05T00:30:00.000Z", closes: "2027-01-05T05:30:00.000Z" };
const data = (over: Partial<TabletData> = {}): TabletData => ({ migrated: true, sessions: [session], sessionId: SESSION, rows: ROWS, enrolled: 2, now: "2027-01-05T02:00:00.000Z", ...over });

/** A face in the picture: where it is (0…1), its numbers, and how it looks to the engine. */
type Scene = { box: { x: number; y: number }; numbers: number[]; yaw?: number; closeness?: number };
function fakeEngine(scene: { faces: Scene[] }) {
  const numbersOf = new WeakMap<object, number[]>();
  const readAll = vi.fn((_video: HTMLVideoElement, t: number) => scene.faces.map(face => {
    const points = [[0, 0], [1, 0], [0, 1], [0, 2], [1, 2]] as never;
    numbersOf.set(points, face.numbers);
    return { faces: scene.faces.length, signal: { t, blinkLeft: 0, blinkRight: 0, smileLeft: 0, smileRight: 0, yaw: face.yaw ?? 0 }, points, box: { x: face.box.x, y: face.box.y, width: 0.15, height: 0.2 }, closeness: face.closeness ?? 0.12 };
  }));
  const embed = vi.fn(async (_source: unknown, points: object) => ({ embedding: numbersOf.get(points)!, sharpness: 100 }));
  return { engine: { readAll, embed } as unknown as TabletEngine, readAll, embed };
}
const fakeStream = () => ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream;

const found = (id: string, name: string, over: Partial<Extract<TabletFaceAnswer, { kind: "dikenali" }>> = {}, role: "peserta" | "bod" = "peserta"): TabletFaceAnswer => ({
  kind: "dikenali", person: { employeeId: id, name, department: "CoE", photo: null, role }, already: false, recorded: role !== "bod", checkedInAt: "2027-01-05T02:00:05.000Z", ...over,
});
const answerOf = (faces: TabletFaceAnswer[], present = 1): TabletAnswer => ({ faces, present, total: 3 });

function fakeApi(over: Partial<PanitiaApi> = {}): PanitiaApi {
  return {
    changeSession: vi.fn(), silent: vi.fn(), announce: vi.fn(), unpin: vi.fn(), removeAnnouncement: vi.fn(), moderate: vi.fn(), refresh: vi.fn(), navigate: vi.fn(),
    attendance: vi.fn(async () => ({ rows: ROWS })),
    setPresent: vi.fn(async () => ({ rows: [row("a", "Sari", "2027-01-05T02:01:00.000Z"), ROWS[1], ROWS[2]] })),
    ...over,
  };
}

type Setup = { scene?: { faces: Scene[] }; client?: FaceTabletClient; api?: PanitiaApi; data?: TabletData; getStream?: () => Promise<MediaStream> };
function setup(options: Setup = {}) {
  const scene = options.scene ?? { faces: [] };
  const { engine, readAll, embed } = fakeEngine(scene);
  const client: FaceTabletClient = options.client ?? { identify: vi.fn(async (input: TabletRequest) => answerOf(input.faces.map(() => ({ kind: "tidak-dikenali" as const })), 0)) };
  const api = options.api ?? fakeApi();
  const view = render(<ToastProvider><PanitiaApiContext.Provider value={api}>
    <FaceTablet data={options.data ?? data()} backHref="/wam2026/kelola/absen" client={client} loadEngine={async () => engine} getStream={options.getStream ?? (async () => fakeStream())} />
  </PanitiaApiContext.Provider></ToastProvider>);
  return { ...view, scene, readAll, embed, client, api };
}
const start = async () => { fireEvent.click(screen.getByRole("button", { name: "Mulai" })); await waitFor(() => expect(screen.queryByRole("button", { name: "Mulai" })).toBeNull()); };
const SLOW = { timeout: 6000 };

describe("Absen mode tablet: before the camera", () => {
  it("says what it does and what it cannot do (no liveness, only numbers leave, manual for the rest)", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Absen mode tablet" })).toBeTruthy();
    const limits = screen.getByRole("list", { name: "Yang perlu diketahui" });
    expect(within(limits).getByText(/Tidak ada pemeriksaan gerakan/)).toBeTruthy();
    expect(within(limits).getByText(/Gambar kamera tidak pernah keluar dari tablet/)).toBeTruthy();
    expect(within(limits).getByText(/Catat manual/)).toBeTruthy();
    expect(screen.getByText("2 dari 3 peserta")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Kembali ke Absen sesi" }).getAttribute("href")).toBe("/wam2026/kelola/absen");
  });

  it("with no session that takes attendance, there is nothing to start", () => {
    setup({ data: data({ sessions: [], sessionId: null, rows: [] }) });
    expect(screen.getByText("Belum ada sesi yang memakai absen.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mulai" })).toBeNull();
  });

  it("camera permission denied: says so, offers Coba lagi and Catat manual, and the camera never ran", async () => {
    const { readAll } = setup({ getStream: () => Promise.reject(new DOMException("no", "NotAllowedError")) });
    fireEvent.click(screen.getByRole("button", { name: "Mulai" }));
    expect((await screen.findByText("Izin kamera ditolak")).closest("[role=alert]")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Coba lagi" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Catat manual" })).toBeTruthy();
    expect(readAll).not.toHaveBeenCalled();
  });

  it("no camera, a busy camera and an old browser each get their own words", async () => {
    for (const [error, title] of [[new DOMException("x", "NotFoundError"), "Kamera tidak ditemukan"], [new DOMException("x", "NotReadableError"), "Kamera sedang dipakai"], [new Error("x"), "Kamera atau pembaca wajah belum bisa dibuka"]] as const) {
      const view = setup({ getStream: () => Promise.reject(error) });
      fireEvent.click(screen.getByRole("button", { name: "Mulai" }));
      expect((await screen.findByText(title)).closest("[role=alert]")).toBeTruthy();
      view.unmount();
    }
  });

  it("a session that has not opened yet says when, and a closed one says when it closed", () => {
    setup({ data: data({ now: "2027-01-05T00:00:00.000Z" }) });
    expect(screen.getByText(/Dibuka 07\.30/)).toBeTruthy();
    cleanup();
    setup({ data: data({ now: "2027-01-05T06:00:00.000Z" }) });
    expect(screen.getByText(/Ditutup 12\.30/)).toBeTruthy();
  });
});

describe("Absen mode tablet: faces in the camera", () => {
  it("reads several faces at once, sends only their numbers in one call, and shows names, brackets and the count", async () => {
    const { client } = setup({
      scene: { faces: [{ box: { x: 0.1, y: 0.3 }, numbers: unit(0) }, { box: { x: 0.45, y: 0.3 }, numbers: unit(1) }, { box: { x: 0.75, y: 0.3 }, numbers: unit(2) }] },
      client: { identify: vi.fn(async () => answerOf([found("a", "Sari"), found("bod", "Pak Hendra", {}, "bod"), { kind: "tidak-dikenali" }])) },
    });
    await start();
    await waitFor(() => expect(client.identify).toHaveBeenCalledTimes(1), SLOW);
    const call = vi.mocked(client.identify).mock.calls[0][0];
    expect(call.sessionId).toBe(SESSION);
    expect(call.faces).toHaveLength(3);
    // Numbers and nothing else: no picture, no name, no time for a live face.
    for (const face of call.faces) expect(Object.keys(face)).toEqual(["embedding"]);
    expect(JSON.stringify(call)).not.toMatch(/data:|blob:|image|photo/i);

    // Sari's name is on her box and in the strip.
    await waitFor(() => expect(screen.getAllByText("Sari")).toHaveLength(2));
    expect(await screen.findByText("Pak Hendra · BOD")).toBeTruthy();
    expect(await screen.findByText("Tidak dikenali")).toBeTruthy();
    // Sari is recorded: the strip, the count, the live announcement. BOD are named but not in the strip.
    const strip = screen.getByLabelText("Baru saja");
    expect(within(strip).getByText("Sari")).toBeTruthy();
    expect(within(strip).queryByText(/Hendra/)).toBeNull();
    expect(screen.getByText("Pak Hendra, BOD, tidak perlu absen")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Hadir" }).getAttribute("aria-valuenow")).toBe("33");
  });

  it("does not send the same faces again every frame (cool-down)", async () => {
    const { client } = setup({
      scene: { faces: [{ box: { x: 0.1, y: 0.3 }, numbers: unit(0) }, { box: { x: 0.6, y: 0.3 }, numbers: unit(1) }] },
      client: { identify: vi.fn(async () => answerOf([found("a", "Sari"), { kind: "tidak-dikenali" }])) },
    });
    await start();
    await waitFor(() => expect(client.identify).toHaveBeenCalledTimes(1), SLOW);
    await act(() => new Promise<void>(resolve => { window.setTimeout(resolve, 1500); }));
    expect(client.identify).toHaveBeenCalledTimes(1);
  });

  it("an already-checked-in person is named as 'sudah hadir' and not added to the strip again", async () => {
    setup({
      scene: { faces: [{ box: { x: 0.3, y: 0.3 }, numbers: unit(0) }] },
      client: { identify: vi.fn(async () => answerOf([found("a", "Sari", { already: true, recorded: false, checkedInAt: "2027-01-05T01:50:00.000Z" })])) },
    });
    await start();
    expect(await screen.findByText("Sari · sudah hadir", {}, SLOW)).toBeTruthy();
    expect(within(screen.getByLabelText("Baru saja")).queryByText("Sari")).toBeNull();
  });

  it("a face too far away, or turned from the tablet, is not read and says what to do", async () => {
    const { client, embed } = setup({ scene: { faces: [{ box: { x: 0.1, y: 0.3 }, numbers: unit(0), closeness: 0.02 }, { box: { x: 0.6, y: 0.3 }, numbers: unit(1), yaw: 50 }] } });
    await start();
    expect(await screen.findByText("Mendekat", {}, SLOW)).toBeTruthy();
    expect(screen.getByText("Hadap kamera")).toBeTruthy();
    await act(() => new Promise<void>(resolve => { window.setTimeout(resolve, 600); }));
    expect(embed).not.toHaveBeenCalled();
    expect(client.identify).not.toHaveBeenCalled();
  });

  it("with no face in front of it, asks for one", async () => {
    setup({ scene: { faces: [] } });
    await start();
    expect(await screen.findByText("Hadapkan wajah ke kamera", {}, SLOW)).toBeTruthy();
  });

  it("an unknown face offers Catat manual, and nobody enrolled says so", async () => {
    setup({
      scene: { faces: [{ box: { x: 0.3, y: 0.3 }, numbers: unit(5) }] },
      client: { identify: vi.fn(async () => answerOf([{ kind: "belum-terdaftar" }], 0)) },
    });
    await start();
    expect(await screen.findByText("Belum terdaftar", {}, SLOW)).toBeTruthy();
    expect(screen.getByText(/Wajah ini belum dikenali/)).toBeTruthy();
    expect(screen.getByText("Belum ada wajah terdaftar")).toBeTruthy();
  });

  it("a face that looks like two people is 'Belum yakin' and not recorded", async () => {
    setup({ scene: { faces: [{ box: { x: 0.3, y: 0.3 }, numbers: unit(5) }] }, client: { identify: vi.fn(async () => answerOf([{ kind: "ragu" }], 0)) } });
    await start();
    expect(await screen.findByText("Belum yakin", {}, SLOW)).toBeTruthy();
    expect(screen.getByText(/Mirip dua orang/)).toBeTruthy();
    expect(within(screen.getByLabelText("Baru saja")).getByText("Belum ada yang dicatat.")).toBeTruthy();
  });

  it("while the session is not open the camera does not read or send anything, and the server's 'di luar jam' also closes it", async () => {
    const closed = setup({ data: data({ now: "2027-01-05T00:00:00.000Z" }), scene: { faces: [{ box: { x: 0.3, y: 0.3 }, numbers: unit(0) }] } });
    await start();
    expect(await screen.findByText("Absen belum dibuka")).toBeTruthy();
    await act(() => new Promise<void>(resolve => { window.setTimeout(resolve, 500); }));
    expect(closed.readAll).not.toHaveBeenCalled();
    cleanup();

    setup({
      scene: { faces: [{ box: { x: 0.3, y: 0.3 }, numbers: unit(0) }] },
      client: { identify: vi.fn(async () => answerOf([{ kind: "di-luar-jam", window: "tutup", opens: session.opens, closes: session.closes }], 0)) },
    });
    await start();
    expect(await screen.findByText("Absen sudah ditutup", {}, SLOW)).toBeTruthy();
  });
});

describe("Absen mode tablet: offline (antre)", () => {
  it("keeps the numbers on the tablet, marks them 'antre', and sends them with their time when the signal returns", async () => {
    let offline = true;
    const identify = vi.fn(async (input: TabletRequest) => {
      if (offline) throw new PanitiaError("Tidak ada koneksi.", 0);
      return answerOf(input.faces.map(() => found("a", "Sari")), 1);
    });
    setup({ scene: { faces: [{ box: { x: 0.3, y: 0.3 }, numbers: unit(0) }] }, client: { identify } });
    await start();
    await waitFor(() => expect(window.localStorage.getItem(FACE_QUEUE_KEY)).toBeTruthy(), SLOW);
    const stored = JSON.parse(window.localStorage.getItem(FACE_QUEUE_KEY)!) as { sessionId: string; embedding: number[]; seenAt: string }[];
    expect(stored).toHaveLength(1);
    expect(Object.keys(stored[0]).sort()).toEqual(["embedding", "seenAt", "sessionId"]);
    expect(await screen.findByText("Menunggu sinyal", { selector: "strong" })).toBeTruthy();
    expect(screen.getByText("antre")).toBeTruthy();
    expect(screen.getByText("1 wajah menunggu sinyal")).toBeTruthy();

    offline = false;
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(window.localStorage.getItem(FACE_QUEUE_KEY)).toBeNull(), SLOW);
    const resent = identify.mock.calls.at(-1)![0];
    expect(resent.faces[0].seenAt).toBe(stored[0].seenAt);
    await waitFor(() => expect(screen.queryByText("antre")).toBeNull());
    expect(within(screen.getByLabelText("Baru saja")).getByText("Sari")).toBeTruthy();
  });

  it("a refusal of ours (not a signal problem) is shown and the faces are not kept", async () => {
    setup({ scene: { faces: [{ box: { x: 0.3, y: 0.3 }, numbers: unit(0) }] }, client: { identify: vi.fn(async () => { throw new PanitiaError("Sesi ini tidak memakai absen.", 404); }) } });
    await start();
    expect(await screen.findByText("Belum tercatat. Coba lagi sebentar.", {}, SLOW)).toBeTruthy();
    expect(window.localStorage.getItem(FACE_QUEUE_KEY)).toBeNull();
  });
});

describe("Absen mode tablet: Catat manual and the session", () => {
  it("searches a person and records them through the manual check-in", async () => {
    const api = fakeApi();
    setup({ api });
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Catat manual" }));
    const sheet = await screen.findByRole("dialog", { name: "Catat manual" });
    fireEvent.change(within(sheet).getByRole("searchbox"), { target: { value: "sar" } });
    expect(within(sheet).queryByText("Budi")).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: "Catat hadir Sari" }));
    await waitFor(() => expect(api.setPresent).toHaveBeenCalledWith(SESSION, { employeeId: "a", present: true }));
    await waitFor(() => expect(within(screen.getByLabelText("Baru saja")).getByText("Sari")).toBeTruthy());
    expect((await screen.findAllByText("Sari dicatat hadir")).length).toBeGreaterThan(0);
  });

  it("the people already in are marked, not offered again", async () => {
    setup({ data: data({ rows: [row("a", "Sari", "2027-01-05T01:00:00.000Z"), ROWS[1]] }) });
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Catat manual" }));
    const sheet = await screen.findByRole("dialog", { name: "Catat manual" });
    expect(within(sheet).queryByRole("button", { name: "Catat hadir Sari" })).toBeNull();
    expect(within(sheet).getByRole("button", { name: "Catat hadir Budi" })).toBeTruthy();
  });

  it("before the window opens, Catat hadir is off and says why", async () => {
    setup({ data: data({ now: "2027-01-05T00:00:00.000Z" }) });
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Catat manual" }));
    const sheet = await screen.findByRole("dialog", { name: "Catat manual" });
    expect(within(sheet).getByText("Catat hadir bisa setelah absen dibuka.")).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "Catat hadir Sari" }).getAttribute("disabled")).not.toBeNull();
  });

  it("choosing another session shows its people and starts clean", async () => {
    const other = { ...session, id: "00000000-0000-4000-8000-0000000000a2", title: "Makan siang", time: "12.00–13.00" };
    const api = fakeApi({ attendance: vi.fn(async () => ({ rows: [row("a", "Sari", "2027-01-05T02:00:00.000Z"), ROWS[1], ROWS[2]] })) });
    setup({ api, data: data({ sessions: [session, other] }) });
    await start();
    fireEvent.click(screen.getByRole("button", { name: /Pemaparan departemen/ }));
    const picker = await screen.findByRole("dialog", { name: "Pilih sesi" });
    fireEvent.click(within(picker).getByRole("button", { name: /Makan siang/ }));
    await waitFor(() => expect(api.attendance).toHaveBeenCalledWith(other.id));
    expect(await screen.findByText("1", { selector: "strong" })).toBeTruthy();
  });
});

describe("Absen mode tablet: the screen", () => {
  it("the panel has the way out, and full screen is offered only where the browser has it", async () => {
    setup();
    await start();
    expect(screen.getByRole("link", { name: "Selesai" }).getAttribute("href")).toBe("/wam2026/kelola/absen");
    const root = document.documentElement as unknown as { requestFullscreen?: () => Promise<void> };
    expect(screen.queryByRole("button", { name: "Layar penuh" }) !== null).toBe(typeof root.requestFullscreen === "function");
  });
});
