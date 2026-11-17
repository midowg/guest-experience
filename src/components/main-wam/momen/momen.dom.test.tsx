import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { sampleFeedKelompok, sampleFeedSemua, sampleMosaic, sampleSessionCounts } from "@/lib/main-wam/momen/sample";
import { sessionChoice } from "@/lib/main-wam/momen/sessions";
import { sampleSessions, sampleViewer } from "@/lib/main-wam/sample";
import { mainWamApi } from "@/lib/routes";
import { ToastProvider } from "@/components/main-wam/ui";

/* Momen's key components in a browser-like DOM: the stack (gestures have buttons), M04, the camera's chips, the Mozaik's switch. */

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), back: vi.fn(), refresh: vi.fn() }), usePathname: () => "/wam/acara/momen" }));
const request = vi.fn(async (...args: unknown[]) => { void args; return { data: { hearts: 25, hearted: true }, message: "" }; });
vi.mock("@/components/pra-wam/api", () => ({ praWamRequest: (...args: unknown[]) => request(...args), errorText: () => "Gagal." }));

const { StackDeck } = await import("./StackDeck");
const { ReportSheet } = await import("./MomenSheets");
const { MomenStack } = await import("./MomenStack");
const { CameraScreen } = await import("./CameraScreen");
const { Mosaic } = await import("./Mosaic");

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  window.matchMedia = window.matchMedia ?? ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as never;
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});
beforeEach(() => { window.history.replaceState(null, "", "/wam/acara/momen"); request.mockClear(); replace.mockClear(); });
afterEach(() => cleanup());

const now = new Date("2027-01-05T10:05:00+07:00");

describe("the stack", () => {
  it("shows at most three cards, and one tap or an arrow key moves (WCAG 2.5.1, 2.5.7)", () => {
    const onIndex = vi.fn();
    render(<StackDeck items={sampleFeedSemua} index={2} onIndex={onIndex} onLike={() => undefined} now={now} label="Momen" describe={index => `${index + 1} dari 24`} />);
    const region = screen.getByRole("region", { name: "Momen" });
    expect(region.getAttribute("aria-roledescription")).toBe("carousel");
    expect(region.querySelectorAll("[data-place]")).toHaveLength(3);
    expect(screen.getByRole("group").getAttribute("aria-label")).toBe("3 dari 24. Foto oleh Dimas, Kelompok 2 · Kawi, 10.02");
    fireEvent.click(screen.getByRole("button", { name: "Foto berikutnya" }));
    expect(onIndex).toHaveBeenLastCalledWith(3, "tap");
    fireEvent.click(screen.getByRole("button", { name: "Foto sebelumnya" }));
    expect(onIndex).toHaveBeenLastCalledWith(1, "tap");
    fireEvent.keyDown(region, { key: "ArrowRight" });
    expect(onIndex).toHaveBeenLastCalledWith(3, "key");
  });

  it("at the end shows its panel, which still goes back with a tap", () => {
    const onIndex = vi.fn();
    render(<StackDeck items={sampleFeedSemua.slice(0, 2)} index={2} onIndex={onIndex} onLike={() => undefined} now={now} label="Momen" describe={() => "selesai"} panel={<h2>Kamu sudah lihat semua</h2>} />);
    expect(screen.getByRole("heading", { name: "Kamu sudah lihat semua" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Foto berikutnya" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Foto sebelumnya" }));
    expect(onIndex).toHaveBeenCalledWith(1, "tap");
  });

  const props = {
    mode: "baru" as const, view: "semua" as const, session: null, sessionTitle: null, items: sampleFeedSemua, next: null, total: 24, startIndex: 2, offset: 0,
    counts: sampleSessionCounts, sessions: sampleSessions.map(session => sessionChoice(session, now)), group: sampleViewer("peserta").group, groupsPublished: true,
    mozaik: true, migrated: true, anyPhotos: true, own: null, eventName: "WAM 2026", nowIso: now.toISOString(), demo: {},
  };

  it("likes at once (optimistic), says the count, and asks the server", async () => {
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    expect(screen.getByText("3 dari 24 baru")).toBeTruthy();
    const heart = screen.getByRole("button", { name: "Suka foto, 24 suka" });
    fireEvent.click(heart);
    expect(screen.getByRole("button", { name: "Batal suka, 25 suka" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(request).toHaveBeenCalledWith(mainWamApi.photoHeart(sampleFeedSemua[2].id), { method: "PUT" }));
  });

  it("filters by Kelompokku and by session through the address", () => {
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    fireEvent.click(screen.getByRole("radio", { name: "Kelompokku" }));
    expect(replace).toHaveBeenCalledWith("/wam/acara/momen?lihat=kelompok", { scroll: false });
    fireEvent.click(screen.getByRole("button", { name: /Saring sesi/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Pemaparan departemen/ }));
    expect(replace).toHaveBeenLastCalledWith(expect.stringContaining("sesi="), { scroll: false });
  });

  it("says when the kelompok is not published yet, and when there is nothing new", () => {
    render(<ToastProvider><MomenStack {...props} view="kelompok" group={null} groupsPublished={false} items={[]} /></ToastProvider>);
    expect(screen.getByRole("heading", { name: "Kelompok belum diterbitkan panitia" })).toBeTruthy();
    cleanup();
    render(<ToastProvider><MomenStack {...props} items={sampleFeedKelompok} startIndex={5} total={5} /></ToastProvider>);
    expect(screen.getByRole("heading", { name: "Kamu sudah lihat semua" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Buka Galeri" }).getAttribute("href")).toBe("/wam/acara/momen/galeri");
  });
});

describe("M04 Laporkan foto", () => {
  it("asks for a reason, and a note for Lainnya, then sends", async () => {
    const onSubmit = vi.fn(async () => undefined);
    render(<ReportSheet open onClose={() => undefined} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Kirim laporan" }));
    expect(screen.getByText("Pilih satu alasan.")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Lainnya" }));
    fireEvent.click(screen.getByRole("button", { name: "Kirim laporan" }));
    expect(screen.getByText("Tulis catatan untuk alasan Lainnya.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "Saya ada di foto ini dan tidak setuju" }));
    fireEvent.click(screen.getByRole("button", { name: "Kirim laporan" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ reason: "tidak_setuju", note: "" }));
  });
});

describe("the camera", () => {
  const camera = (demo: Parameters<typeof CameraScreen>[0]["demo"]) => <ToastProvider><CameraScreen sessions={sampleSessions} nowIso="2027-01-05T15:20:00+07:00" group={sampleViewer("peserta").group}
    groupsPublished mozaik absen migrated initialAudience="semua" initialSession={null} demo={demo} /></ToastProvider>;

  it("tags the running session; ✕ makes it Umum; the shutter says where the photo goes", () => {
    render(camera({ phase: "kamera", live: "contoh" }));
    expect(screen.getByText("Team building")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ambil foto, langsung terkirim ke semua peserta" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hapus tag sesi, jadikan Umum" }));
    expect(screen.getByText("Umum")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Untuk:/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Kelompokku/ }));
    expect(screen.getByRole("button", { name: "Ambil foto, langsung terkirim ke Kelompok 4" })).toBeTruthy();
  });

  it("without permission: the shutter waits, the gallery still works, Izinkan asks again (U05)", () => {
    render(camera({ phase: "kamera", live: "ditolak" }));
    expect(screen.getByRole("heading", { name: "Kamera belum diizinkan" })).toBeTruthy();
    expect((screen.getByRole("button", { name: /Ambil foto/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Pilih dari galeri" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Izinkan" })).toBeTruthy();
  });

  it("asks first, with the reasons, before the browser does (O04)", () => {
    render(camera({ phase: "izin" }));
    expect(screen.getByRole("heading", { name: "Izinkan kamera" })).toBeTruthy();
    expect(screen.getByText("Scan QR absen")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nanti" })).toBeTruthy();
  });
});

describe("the Mozaik", () => {
  it("marks one's own photos with numbers and where they are", () => {
    render(<ToastProvider><Mosaic initial={sampleMosaic()} mark={false} title="Mozaik WAM 2026" demo /></ToastProvider>);
    expect(screen.getByText("4 fotomu ada di mozaik")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Mozaik WAM 2026, 312 dari 600 foto");
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("list", { name: "Fotomu di mozaik" }).querySelectorAll("li")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Lihat foto" }).getAttribute("href")).toMatch(/^\/wam\/acara\/momen\?foto=/);
    expect(window.location.search).toBe("?tandai=1");
  });
});
