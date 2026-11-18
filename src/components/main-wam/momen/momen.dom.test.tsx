import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HEART, withReaction } from "@/lib/main-wam/momen/reactions";
import { sampleFeedSemua, sampleMosaic, sampleReactions, sampleSessionCounts } from "@/lib/main-wam/momen/sample";
import { sessionChoice } from "@/lib/main-wam/momen/sessions";
import { sampleSessionIds, sampleSessions } from "@/lib/main-wam/sample";
import { mainWamApi } from "@/lib/routes";
import { ToastProvider } from "@/components/main-wam/ui";

/* Momen's key components in a browser-like DOM: the stack (gestures have buttons), M04, the camera's chips, the Mozaik's switch. */

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), back: vi.fn(), refresh: vi.fn() }), usePathname: () => "/wam/acara/momen" }));
/** The server's answer to a reaction: the photo's reactions with the person's emoji in (PUT) or out (DELETE), from sample photo 3 (24 reactions). */
const request = vi.fn(async (...args: unknown[]) => {
  const options = (args[1] ?? {}) as { method?: string; json?: { emoji: string } };
  const base = sampleReactions(24);
  return { data: { reactions: options.method === "PUT" ? withReaction(base, options.json!.emoji) : base }, message: "" };
});
vi.mock("@/components/pra-wam/api", () => ({ praWamRequest: (...args: unknown[]) => request(...args), errorText: () => "Gagal." }));

const { StackDeck } = await import("./StackDeck");
const { ReportSheet } = await import("./MomenSheets");
const { MomenStack } = await import("./MomenStack");
const { CameraScreen } = await import("./CameraScreen");
const { Mosaic } = await import("./Mosaic");
const { MosaicCanvas } = await import("./MosaicCanvas");
const { Gallery } = await import("./Gallery");
const { StackSkeleton } = await import("./Skeletons");
const { ActionsSlotContext } = await import("@/components/main-wam/shell/ShellSlots");

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
    expect(screen.getByRole("group", { name: /^3 dari 24./ }).getAttribute("aria-label")).toBe("3 dari 24. Foto oleh Dimas, Kelompok 2 · Kawi, 10.02");
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
    mode: "baru" as const, session: null, sessionTitle: null, items: sampleFeedSemua, next: null, total: 24, startIndex: 2, offset: 0,
    mozaik: true, migrated: true, anyPhotos: true, own: null, eventName: "WAM 2026", nowIso: now.toISOString(), demo: {},
  };

  const pill = (emoji: string, n: number, mine = false) => `${emoji} ${n} reaksi${mine ? ", kamu bereaksi" : ""}`;
  const quick = (emoji: string) => screen.getByRole("button", { name: `Reaksi ${emoji}` });
  const shown = (name: string) => screen.queryByRole("button", { name });

  it("has the camera and the gallery beside the title, and no filter at all (no Semua / Kelompokku, no session chip)", () => {
    const slot = document.createElement("div");
    document.body.append(slot);
    render(<ActionsSlotContext.Provider value={slot}><ToastProvider><MomenStack {...props} /></ToastProvider></ActionsSlotContext.Provider>);
    expect([...slot.querySelectorAll("a")].map(link => [link.getAttribute("aria-label"), link.getAttribute("href")])).toEqual([["Ambil foto", "/wam/acara/momen/kamera"], ["Galeri", "/wam/acara/momen/galeri"]]);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("radio", { name: "Kelompokku" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Saring sesi/ })).toBeNull();
    expect(document.body.textContent).not.toMatch(/Kelompokku|Untuk:/);
    slot.remove();
  });

  it("keeps the stack swipeable: the side taps and the arrow keys still move", () => {
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    expect(screen.getByText("3 dari 24 baru")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Foto berikutnya" }));
    expect(screen.getByText("4 dari 24 baru")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("region", { name: "Momen" }), { key: "ArrowLeft" });
    expect(screen.getByText("3 dari 24 baru")).toBeTruthy();
  });

  it("shows the reactions a photo got as pills inside it, each with a spoken name, and the row of quick emoji under it", () => {
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    const front = screen.getByRole("group", { name: /^Foto ke-3 dari 24 foto baru/ });
    const pills = within(front).getByRole("group", { name: "Reaksi pada foto" });
    expect(within(pills).getAllByRole("button").map(button => button.getAttribute("aria-label"))).toEqual([pill(HEART, 12), pill("😂", 3), pill("🔥", 5), pill("👏", 4)]);
    const row = screen.getByRole("group", { name: "Reaksi cepat" });
    expect(within(row).getAllByRole("button").map(button => button.getAttribute("aria-label"))).toEqual([HEART, "😂", "🔥", "👏", "😮", "🙏"].map(emoji => `Reaksi ${emoji}`).concat("Pilih reaksi lain"));
    expect(row.parentElement!.className).toContain("actions");
  });

  it("reacts at once (optimistic) with a quick emoji, the pill is the person's own, and the server is asked", async () => {
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    expect(shown(pill("😮", 1, true))).toBeNull();
    fireEvent.click(quick("😮"));
    expect(shown(pill("😮", 1, true))!.getAttribute("aria-pressed")).toBe("true");
    expect(quick("😮").getAttribute("aria-pressed")).toBe("true");
    expect(document.body.textContent).toContain("Kamu bereaksi 😮");
    await waitFor(() => expect(request).toHaveBeenCalledWith(mainWamApi.photoReaction(sampleFeedSemua[2].id), { method: "PUT", json: { emoji: "😮" } }));
  });

  it("a second tap on the same emoji takes the reaction back (DELETE)", async () => {
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    fireEvent.click(quick("😮"));
    fireEvent.click(quick("😮"));
    expect(shown(pill("😮", 1, true))).toBeNull();
    expect(shown(pill("😮", 1))).toBeNull();
    expect(quick("😮").getAttribute("aria-pressed")).toBe("false");
    expect(document.body.textContent).toContain("Reaksimu dibatalkan");
    await waitFor(() => expect(request).toHaveBeenLastCalledWith(mainWamApi.photoReaction(sampleFeedSemua[2].id), { method: "DELETE" }));
  });

  it("one reaction per person: another emoji replaces the first (the old count goes down, the new one goes up)", () => {
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    fireEvent.click(quick(HEART));
    expect(shown(pill(HEART, 13, true))).toBeTruthy();
    fireEvent.click(quick("🔥"));
    expect(shown(pill(HEART, 12))).toBeTruthy();
    expect(shown(pill("🔥", 6, true))).toBeTruthy();
    expect(screen.getAllByRole("button", { pressed: true }).filter(button => /bereaksi|Reaksi/.test(button.getAttribute("aria-label") ?? ""))).toHaveLength(2);
  });

  it("a tap on a pill reacts with that emoji, or takes it back", async () => {
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    fireEvent.click(shown(pill("😂", 3))!);
    expect(shown(pill("😂", 4, true))).toBeTruthy();
    await waitFor(() => expect(request).toHaveBeenCalledWith(mainWamApi.photoReaction(sampleFeedSemua[2].id), { method: "PUT", json: { emoji: "😂" } }));
    fireEvent.click(shown(pill("😂", 4, true))!);
    expect(shown(pill("😂", 3))).toBeTruthy();
  });

  it("puts the count back and says so when the server refuses (rollback)", async () => {
    request.mockImplementationOnce(async () => { throw new Error("Gagal."); });
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    fireEvent.click(quick("😮"));
    expect(shown(pill("😮", 1, true))).toBeTruthy();
    await waitFor(() => expect(shown(pill("😮", 1, true))).toBeNull());
    expect(shown(pill(HEART, 12))).toBeTruthy();
    expect(screen.getByText("Gagal.")).toBeTruthy();
  });

  it("opens the sheet of every emoji from \"+\" (grouped), and a choice closes it and reacts", async () => {
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Pilih reaksi lain" }));
    const sheet = screen.getByRole("dialog", { name: "Pilih reaksi" });
    expect(within(sheet).getAllByRole("heading", { level: 3 }).map(heading => heading.textContent)).toEqual(["Wajah", "Tangan", "Hati", "Perayaan", "Lainnya"]);
    expect(within(sheet).getAllByRole("button", { name: /^Reaksi / }).length).toBeGreaterThanOrEqual(55);
    fireEvent.click(within(sheet).getByRole("button", { name: "Reaksi 🥳" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Pilih reaksi" })).toBeNull());
    expect(shown(pill("🥳", 1, true))).toBeTruthy();
    await waitFor(() => expect(request).toHaveBeenCalledWith(mainWamApi.photoReaction(sampleFeedSemua[2].id), { method: "PUT", json: { emoji: "🥳" } }));
  });

  it("marks the chosen emoji in the sheet, and choosing it again takes it back", () => {
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    fireEvent.click(quick("🔥"));
    fireEvent.click(screen.getByRole("button", { name: "Pilih reaksi lain" }));
    const sheet = screen.getByRole("dialog", { name: "Pilih reaksi" });
    expect(within(sheet).getByRole("button", { name: "Reaksi 🔥" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(sheet).getByRole("button", { name: "Reaksi 🔥" }));
    expect(shown(pill("🔥", 5))).toBeTruthy();
  });

  it("a double tap on the photo is the red heart, once (a third tap does not take it back)", async () => {
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    const card = screen.getByRole("group", { name: /^Foto ke-3 dari 24 foto baru/ });
    fireEvent.click(card); fireEvent.click(card);
    expect(shown(pill(HEART, 13, true))).toBeTruthy();
    fireEvent.click(card); fireEvent.click(card);
    expect(shown(pill(HEART, 13, true))).toBeTruthy();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  });

  it("on one's own photo: the reactions it got as pills that only show, no quick row, no heart button, the Fotomu pill, 'Sudah kamu lihat' after the new ones", () => {
    const items = sampleFeedSemua.map((photo, index) => (index === 2 ? { ...photo, mine: true, seen: true, reactions: sampleReactions(7) } : photo));
    render(<ToastProvider><MomenStack {...props} items={items} total={2} startIndex={2} /></ToastProvider>);
    expect(screen.getByText("Fotomu")).toBeTruthy();
    const pills = within(screen.getByRole("group", { name: /^Foto ke-[0-9] dari 2 foto baru/ })).getByRole("group", { name: "Reaksi pada fotomu" });
    expect(within(pills).queryAllByRole("button")).toHaveLength(0);
    expect(within(pills).getAllByRole("img").map(item => item.getAttribute("aria-label"))).toEqual([pill(HEART, 4), pill("😂", 1), pill("🔥", 1), pill("👏", 1)]);
    expect(screen.queryByRole("group", { name: "Reaksi cepat" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Reaksi / })).toBeNull();
    expect(screen.queryByRole("button", { name: /Suka/ })).toBeNull();
    fireEvent.click(within(pills).getAllByRole("img")[0]);
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByText("Sudah kamu lihat")).toBeTruthy();
    expect(screen.queryByText(/dari 2 baru/)).toBeNull();
    cleanup();
    render(<ToastProvider><MomenStack {...props} items={items} total={2} startIndex={1} /></ToastProvider>);
    expect(screen.getByText("2 dari 2 baru")).toBeTruthy();
    expect(screen.queryByText("Fotomu")).toBeNull();
  });

  it("a photo nobody reacted to has no pills, and one's own keeps the same height of row under it (the card does not jump)", () => {
    const items = sampleFeedSemua.map((photo, index) => (index === 2 ? { ...photo, mine: true, seen: true, reactions: [] } : photo));
    const { container } = render(<ToastProvider><MomenStack {...props} items={items} total={2} startIndex={2} /></ToastProvider>);
    expect(screen.queryByRole("group", { name: /^Reaksi pada/ })).toBeNull();
    expect(container.querySelector('[class*="actions"]')).toBeTruthy();
  });

  it("the options (…) sit on the photo, and reporting is still there for another person's photo", () => {
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    const front = screen.getByRole("group", { name: /^Foto ke-3 dari 24 foto baru/ });
    fireEvent.click(within(front).getByRole("button", { name: "Pilihan foto" }));
    expect(screen.getByText("Laporkan foto")).toBeTruthy();
  });

  it("with no photo at all invites the first one, with a camera button", () => {
    render(<ToastProvider><MomenStack {...props} items={[]} total={0} anyPhotos={false} startIndex={0} /></ToastProvider>);
    expect(screen.getByText("Belum ada foto")).toBeTruthy();
    expect(screen.getByText("Jadilah yang pertama memotret WAM 2026.")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Ambil foto" })[0].getAttribute("href")).toBe("/wam/acara/momen/kamera");
  });

  it("says there is nothing new when every photo was seen, with a way to the gallery", () => {
    render(<ToastProvider><MomenStack {...props} items={sampleFeedSemua.slice(0, 5)} startIndex={5} total={5} /></ToastProvider>);
    expect(screen.getByRole("heading", { name: "Kamu sudah lihat semua" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Buka Galeri" }).getAttribute("href")).toBe("/wam/acara/momen/galeri");
  });
});

describe("the stack's height (the owner's Pixel 9 Pro: no empty gap between the cards and the actions)", () => {
  const css = readFileSync(join(process.cwd(), "src/components/main-wam/momen/momen.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  it("the deck is a flex item that takes what is left (no fixed reserve), up to a 9:16 card, and the actions follow it", () => {
    expect(css).not.toMatch(/--mw-reserve|100dvh/);
    expect(css).toMatch(/\.deck \{[^}]*flex: 1 1 0;[^}]*max-height: var\(--mw-deck-max\)/);
    expect(css).toMatch(/--mw-deck-max: calc\([^;]*\* 1\.78/);
    expect(css).toMatch(/\.stage \{[^}]*justify-content: center/);
    expect(css).not.toMatch(/\.actions \{[^}]*margin-top: auto/);
    expect(css).toMatch(/\.pile \{[^}]*height: min\(calc\(100cqh/);
  });
  it("the stack draws its cards, the line and the actions inside one stage", () => {
    const { container } = render(<ToastProvider><MomenStack {...{
      mode: "baru" as const, session: null, sessionTitle: null, items: sampleFeedSemua, next: null, total: 24, startIndex: 2, offset: 0,
      mozaik: true, migrated: true, anyPhotos: true, own: null,
      eventName: "WAM 2026", nowIso: now.toISOString(), demo: {},
    }} /></ToastProvider>);
    const stage = container.querySelector('[class*="stage"]')!;
    expect(stage.querySelector('[role="region"]')).toBeTruthy();
    expect(stage.querySelector('[class*="actions"]')).toBeTruthy();
  });
  it("the reactions sit inside the photo, bottom left, wrapping upward; the owner's pill moved to the top", () => {
    const reactions = readFileSync(join(process.cwd(), "src/components/main-wam/momen/reactions.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(reactions).toMatch(/\.pills \{[^}]*position: absolute;[^}]*left: var\(--mw-space-8\);[^}]*bottom: var\(--mw-space-8\)[^}]*flex-wrap: wrap-reverse/);
    expect(reactions).toMatch(/\.pills \{[^}]*pointer-events: none/);
    expect(reactions).toMatch(/\.pill \{[^}]*background: var\(--mw-media-scrim\);[^}]*color: var\(--mw-media-on\)/);
    expect(reactions).toMatch(/\.pill\[data-mine\] \{[^}]*background: var\(--mw-primary\)/);
    expect(reactions).toMatch(/\.pill::after \{[^}]*inset: -6px/);
    expect(reactions).toMatch(/\.quickButton \{[^}]*width: var\(--mw-touch\);[^}]*height: var\(--mw-touch\)/);
    expect(reactions).toMatch(/@media \(prefers-reduced-motion: reduce\)[^]*\.pill\[data-mine\] \.pillEmoji \{ animation: none; \}/);
    expect(css).toMatch(/\.info \{[^}]*top: var\(--mw-space-8\)/);
    expect(css).not.toMatch(/\.info \{[^}]*bottom:/);
    expect(css).toMatch(/\.options \{[^}]*top: var\(--mw-space-8\);[^}]*right: var\(--mw-space-8\)/);
    expect(css).not.toMatch(/\.filter\b|\.camera \{|\.react \{/);
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
  const camera = (demo: Parameters<typeof CameraScreen>[0]["demo"]) => <ToastProvider><CameraScreen sessions={sampleSessions} nowIso="2027-01-05T15:20:00+07:00"
    absen migrated initialSession={null} demo={demo} /></ToastProvider>;

  it("tags the running session; ✕ makes it Umum; the shutter says the photo goes to everyone (no \"Untuk\" to choose)", () => {
    render(camera({ phase: "kamera", live: "contoh" }));
    expect(screen.getByText("Team building")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ambil foto, langsung terkirim ke semua peserta" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hapus tag sesi, jadikan Umum" }));
    expect(screen.getByText("Umum")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Untuk:/ })).toBeNull();
    expect(document.body.textContent).not.toMatch(/Kelompokku|Untuk:/);
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

describe("fixes after the audit", () => {
  const galleryProps = {
    view: "semua" as const, session: sampleSessionIds.bns, sessionTitle: "Batu Night Spectacular", items: [], next: null, total: 0, counts: sampleSessionCounts,
    sessions: sampleSessions.map(session => sessionChoice(session, now)), mozaik: true, migrated: true, nowIso: now.toISOString(),
  };

  it("T-M02: a gallery filtered to a session without photos says 0 foto and offers every session", () => {
    render(<ToastProvider><Gallery {...galleryProps} /></ToastProvider>);
    expect(screen.getByRole("heading", { name: "Belum ada foto di sesi ini" })).toBeTruthy();
    expect(document.body.textContent).toContain("Batu Night Spectacular\u00a0· 0 foto");
    fireEvent.click(screen.getByRole("button", { name: "Semua sesi" }));
    expect(replace).toHaveBeenCalledWith("/wam/acara/momen/galeri", { scroll: false });
  });

  it("T-M02: the stack filtered to a session without photos offers every session too", () => {
    render(<ToastProvider><MomenStack mode="sesi" session={sampleSessionIds.bns} sessionTitle="Batu Night Spectacular" items={[]} next={null} total={0} startIndex={0} offset={0}
      mozaik migrated anyPhotos={false} own={null} eventName="WAM 2026" nowIso={now.toISOString()} demo={{}} /></ToastProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Semua sesi" }));
    expect(replace).toHaveBeenCalledWith("/wam/acara/momen", { scroll: false });
  });

  it("M3: Hapus foto of a nominated photo (409) closes the dialog and says why", async () => {
    request.mockImplementationOnce(async () => { throw Object.assign(new Error("Foto ini masuk nominasi Awarding, jadi tidak bisa dihapus."), { name: "PraWamApiError", status: 409 }); });
    const mine = { ...sampleFeedSemua[0], mine: true };
    render(<ToastProvider><Gallery {...galleryProps} view="saya" session={null} sessionTitle={null} items={[mine]} total={1} /></ToastProvider>);
    fireEvent.click(screen.getByRole("button", { name: /^Fotomu/ }));
    fireEvent.click(screen.getByRole("button", { name: "Hapus foto" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Hapus foto" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(mainWamApi.photo(mine.id), { method: "DELETE" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByText("Gagal.")).toBeTruthy();
  });

  it("L5: a large photo whose short-lived address ran out is fetched once more through the server", () => {
    const photo = { ...sampleFeedSemua[0], src: { kecil: "https://r2.example/a-kecil.jpg?sig=1", besar: "https://r2.example/a.jpg?sig=1" } };
    render(<StackDeck items={[photo, ...sampleFeedSemua.slice(1)]} index={0} onIndex={() => undefined} onLike={() => undefined} now={now} label="Momen" describe={() => ""} />);
    const front = document.querySelector<HTMLElement>('[data-place="front"]')!;
    const big = () => front.querySelector<HTMLImageElement>("img[data-loaded]")!;
    const small = () => front.querySelector<HTMLImageElement>("img:not([data-loaded])")!;
    expect(big().getAttribute("src")).toBe(photo.src.besar);
    fireEvent.error(big());
    expect(big().getAttribute("src")).toBe(mainWamApi.photoFile(photo.id, "besar"));
    // A second error stays (hidden or deleted meanwhile): no loop.
    fireEvent.error(big());
    expect(big().getAttribute("src")).toBe(mainWamApi.photoFile(photo.id, "besar"));
    fireEvent.error(small());
    expect(small().getAttribute("src")).toBe(mainWamApi.photoFile(photo.id, "kecil"));
  });

  it("T-M04: the zoomed canvas is a named region the keyboard can reach and scroll", () => {
    const { rerender } = render(<MosaicCanvas manifest={sampleMosaic()} mark={false} zoom={1} onZoom={() => undefined} focus={null} label="Mozaik" />);
    const region = screen.getByRole("region", { name: "Kanvas mozaik" });
    expect(region.hasAttribute("tabindex")).toBe(false);
    rerender(<MosaicCanvas manifest={sampleMosaic()} mark={false} zoom={2} onZoom={() => undefined} focus={null} label="Mozaik" />);
    expect(screen.getByRole("region", { name: "Kanvas mozaik" }).getAttribute("tabindex")).toBe("0");
  });

  it("T-M05: while Momen loads, Galeri and Mozaik hold their place beside the title", () => {
    const slot = document.createElement("div");
    document.body.append(slot);
    render(<ActionsSlotContext.Provider value={slot}><StackSkeleton /></ActionsSlotContext.Provider>);
    expect(slot.querySelectorAll("[aria-hidden] > *")).toHaveLength(2);
    slot.remove();
  });

  it("M06: the progress is the screen's main number (ProgressBar labelSize=subtitle)", async () => {
    const dataCss = (await import("@/components/main-wam/ui/data.module.css")).default;
    render(<ToastProvider><Mosaic initial={sampleMosaic()} mark={false} title="Mozaik WAM 2026" demo /></ToastProvider>);
    expect(screen.getByRole("progressbar").parentElement!.className).toContain(dataCss.progressSubtitle);
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
