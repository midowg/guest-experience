import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ToastProvider } from "@/components/main-wam/ui";
import { SCAN_QUEUE_KEY } from "@/lib/main-wam/modul/absen";
import { mainWamApi } from "@/lib/routes";
import { AbsenQueue } from "./AbsenQueue";
import { enqueueScan, flushQueue, loadQueue, retryDelay } from "./queue";

/*
 * The absen queue (audit T1): a scan kept offline leaves the phone only when the server answered it
 * for good; signed out, busy, too many, or a hotel Wi-Fi's login page keep it to try again, and the
 * person is told.
 */

const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";
const OTHER = "ZyXwVuTsRqPoNmLkJiHgFe";
const scan = { token: TOKEN, scannedAt: "2027-01-05T00:52:00.000+00:00", title: "Pemaparan departemen" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const recorded = (title = "Pemaparan departemen") => json(200, { ok: true, data: { kind: "tercatat", session: { id: "s", title, place: "" }, checkedInAt: scan.scannedAt }, message: "Absen tercatat." });
let answers: (() => Response | Promise<Response>)[] = [];
let calls: { url: string; body: unknown }[] = [];
const reload = vi.fn();

beforeEach(() => {
  window.localStorage.clear();
  answers = []; calls = []; reload.mockReset();
  Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload } });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const next = answers.shift();
    if (!next) throw new TypeError("Failed to fetch");
    return next();
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("flushQueue", () => {
  it("sends the scan with its time and drops it only when the server answered with a result", async () => {
    enqueueScan(scan);
    answers = [() => recorded()];
    const result = await flushQueue();
    expect(calls).toEqual([{ url: mainWamApi.checkIn(TOKEN), body: { scannedAt: scan.scannedAt } }]);
    expect(result).toMatchObject({ sent: [{ scan, outcome: { kind: "tercatat" } }], dropped: [], kept: 0, login: false });
    expect(loadQueue()).toEqual([]);
  });

  for (const [label, response] of [
    ["401 (signed out)", () => json(401, { ok: false, message: "Sesi berakhir." })],
    ["429 (too many)", () => json(429, { ok: false, message: "Terlalu sering." })],
    ["503 (server busy)", () => json(503, { ok: false, message: "Layanan belum dapat memproses." })],
    ["504 without JSON (a proxy)", () => new Response("Gateway Timeout", { status: 504 })],
    ["a hotel Wi-Fi's login page (HTML 200)", () => new Response("<html>Hotel Wi-Fi login</html>", { status: 200, headers: { "Content-Type": "text/html" } })],
    ["JSON 200 that is not ours", () => json(200, { welcome: "Hotel" })],
    ["404 that is not ours (HTML)", () => new Response("<html>Not found</html>", { status: 404 })],
  ] as const) {
    it(`keeps the scan when answered with ${label}`, async () => {
      enqueueScan(scan);
      answers = [response];
      const result = await flushQueue();
      expect(result.sent).toEqual([]);
      expect(result.kept).toBe(1);
      expect(result.login).toBe(label.startsWith("401"));
      expect(loadQueue()).toEqual([scan]);
      // Signed out: no reload in the middle of sending (the person is asked to sign in instead).
      expect(reload).not.toHaveBeenCalled();
    });
  }

  it("keeps it without a connection", async () => {
    enqueueScan(scan);
    expect((await flushQueue()).kept).toBe(1);
    expect(loadQueue()).toEqual([scan]);
  });

  it("drops a scan our server refused for good (the QR is gone, not valid), and says why", async () => {
    enqueueScan(scan);
    enqueueScan({ ...scan, token: OTHER });
    answers = [() => json(404, { ok: false, message: "QR tidak dikenali." }), () => json(422, { ok: false, message: "Periksa kembali isian formulir." })];
    const result = await flushQueue();
    expect(result.dropped.map(item => item.message)).toEqual(["QR tidak dikenali.", "Periksa kembali isian formulir."]);
    expect(loadQueue()).toEqual([]);
  });

  it("stops at the first scan that cannot go now, keeping the rest in order", async () => {
    enqueueScan(scan);
    enqueueScan({ ...scan, token: OTHER, title: "Silent Meeting" });
    answers = [() => json(503, { ok: false, message: "Sibuk." })];
    const result = await flushQueue();
    expect(calls).toHaveLength(1);
    expect(result.kept).toBe(2);
    expect(loadQueue().map(item => item.token)).toEqual([TOKEN, OTHER]);
  });

  it("waits longer each time it could not send, up to 5 minutes", () => {
    expect([0, 1, 2, 3, 4, 9].map(retryDelay)).toEqual([15_000, 30_000, 60_000, 120_000, 300_000, 300_000]);
  });
});

describe("AbsenQueue", () => {
  const mount = () => render(<ToastProvider><AbsenQueue /></ToastProvider>);

  it("tells the person when a queued scan is recorded", async () => {
    enqueueScan(scan);
    answers = [() => recorded()];
    mount();
    expect(await screen.findByText("Absen tercatat")).toBeTruthy();
    expect(screen.getByText("Pemaparan departemen")).toBeTruthy();
    expect(window.localStorage.getItem(SCAN_QUEUE_KEY)).toBeNull();
  });

  it("says it will try again when the server is busy, and tries again by itself", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    enqueueScan(scan);
    answers = [() => json(503, { ok: false, message: "Sibuk." })];
    mount();
    expect(await screen.findByText("Belum terkirim, dicoba lagi")).toBeTruthy();
    expect(loadQueue()).toEqual([scan]);
    answers = [() => recorded()];
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(await screen.findByText("Absen tercatat")).toBeTruthy();
    expect(loadQueue()).toEqual([]);
  });

  it("asks to sign in again when signed out, keeping the scan", async () => {
    enqueueScan(scan);
    answers = [() => json(401, { ok: false, message: "Sesi berakhir." })];
    mount();
    expect(await screen.findByText("Absen belum terkirim")).toBeTruthy();
    expect(screen.getByText("Masuk lagi untuk mengirimnya.")).toBeTruthy();
    expect(loadQueue()).toEqual([scan]);
    screen.getByRole("button", { name: "Masuk" }).click();
    expect(reload).toHaveBeenCalled();
  });
});
