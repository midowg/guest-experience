import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HEART, withReaction } from "@/lib/main-wam/momen/reactions";
import { pileTilt } from "@/lib/main-wam/momen/stack";
import { sampleFeedSemua, sampleMosaic, sampleReactions, sampleReactors } from "@/lib/main-wam/momen/sample";
import { sampleSessionIds, sampleSessions } from "@/lib/main-wam/sample";
import { mainWamApi } from "@/lib/routes";
import { ToastProvider } from "@/components/main-wam/ui";

/* Momen's key components in a browser-like DOM: the stack (gestures have buttons), M04, the camera's chips, the Mozaik's switch. */

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), back: vi.fn(), refresh: vi.fn() }), usePathname: () => "/wam2026/momen" }));
/** The server's answer to a reaction: the photo's reactions with the person's emoji in (PUT) or out (DELETE), from sample photo 3 (24 reactions). */
const request = vi.fn(async (...args: unknown[]) => {
  const options = (args[1] ?? {}) as { method?: string; json?: { emoji: string } };
  if (!options.method) return { data: { reactors: sampleReactors(sampleReactions(24)) }, message: "" };
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
const { StackSkeleton } = await import("./Skeletons");
const { ActionsSlotContext } = await import("@/components/main-wam/shell/ShellSlots");

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  window.matchMedia = window.matchMedia ?? ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as never;
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});
beforeEach(() => { window.history.replaceState(null, "", "/wam2026/momen"); request.mockClear(); replace.mockClear(); });
afterEach(() => cleanup());

const now = new Date("2027-01-05T10:05:00+07:00");

describe("the stack", () => {
  it("shows at most three cards; they are swiped, the arrow keys are the keyboard's way, and there is no next or previous button", () => {
    const onIndex = vi.fn();
    render(<StackDeck items={sampleFeedSemua} index={2} onIndex={onIndex} onLike={() => undefined} now={now} label="Momen" describe={index => `${index + 1} dari 24`} />);
    const region = screen.getByRole("region", { name: "Momen" });
    expect(region.getAttribute("aria-roledescription")).toBe("carousel");
    expect(region.querySelectorAll("[data-place]")).toHaveLength(3);
    expect(screen.getByRole("group", { name: /^3 dari 24./ }).getAttribute("aria-label")).toBe("3 dari 24. Foto oleh Dimas, 10.02");
    // The cards behind lie at a tilt of their own (2 to 7 degrees, from the photo's id); the front one is straight.
    const [front, next, later] = [...region.querySelectorAll<HTMLElement>("[data-place]")];
    expect(front.style.getPropertyValue("--tilt")).toBe("");
    expect(next.style.getPropertyValue("--tilt")).toBe(`${pileTilt(sampleFeedSemua[3].id).angle}deg`);
    expect(later.style.getPropertyValue("--tilt")).toBe(`${pileTilt(sampleFeedSemua[4].id).angle}deg`);
    expect(next.style.getPropertyValue("--tilt")).not.toBe(later.style.getPropertyValue("--tilt"));
    expect(screen.queryByRole("button", { name: "Foto berikutnya" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Foto sebelumnya" })).toBeNull();
    fireEvent.keyDown(region, { key: "ArrowRight" });
    expect(onIndex).toHaveBeenLastCalledWith(3, "key");
    fireEvent.keyDown(region, { key: "ArrowLeft" });
    expect(onIndex).toHaveBeenLastCalledWith(1, "key");
  });

  it("at the end shows its panel in the card's place, with no next button", () => {
    render(<StackDeck items={sampleFeedSemua.slice(0, 2)} index={2} onIndex={() => undefined} onLike={() => undefined} now={now} label="Momen" describe={() => "selesai"} panel={<h2>Kamu sudah lihat semua</h2>} />);
    expect(screen.getByRole("heading", { name: "Kamu sudah lihat semua" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Foto berikutnya" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Foto sebelumnya" })).toBeNull();
  });

  const props = {
    mode: "baru" as const, session: null, sessionTitle: null, items: sampleFeedSemua, next: null, total: 24, startIndex: 2, offset: 0,
    mozaik: true, migrated: true, anyPhotos: true, own: null, eventName: "WAM 2026", nowIso: now.toISOString(), demo: {},
  };

  /** The pill on the front photo (three avatars and the number of reactions): one button. */
  const pillsButton = () => screen.getByRole("button", { name: /reaksi.*Ketuk untuk melihat siapa saja/ });
  /** Its number: the total of reactions. */
  const total = () => pillsButton().querySelector('[class*="sumCount"]')!.textContent;
  const quick = (emoji: string) => screen.getByRole("button", { name: `Reaksi ${emoji}` });
  const mineQuick = (emoji: string) => quick(emoji).getAttribute("aria-pressed") === "true";

  it("has Galeri (an icon, left) and Foto in the bar, nothing to Mozaik, and no filter at all (no Semua / Kelompokku, no session chip)", () => {
    const slot = document.createElement("div");
    document.body.append(slot);
    render(<ActionsSlotContext.Provider value={slot}><ToastProvider><MomenStack {...props} /></ToastProvider></ActionsSlotContext.Provider>);
    expect([...slot.querySelectorAll("a")].map(link => [link.getAttribute("aria-label") ?? link.textContent, link.getAttribute("href")])).toEqual([["Galeri", "/wam2026/momen/galeri"], ["Foto", "/wam2026/momen/kamera"]]);
    // The icon alone: no word, a tooltip, the name for a screen reader.
    const gallery = within(slot).getByRole("link", { name: "Galeri" });
    expect(gallery.textContent).toBe("");
    expect(gallery.getAttribute("title")).toBe("Galeri");
    expect(gallery.querySelector("svg")).toBeTruthy();
    expect(slot.querySelector('a[href*="mozaik"]')).toBeNull();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("radio", { name: "Kelompokku" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Saring sesi/ })).toBeNull();
    expect(document.body.textContent).not.toMatch(/Kelompokku|Untuk:/);
    slot.remove();
  });

  it("keeps the stack swipeable by the arrow keys, with no counter of photos on screen and no next button", () => {
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    expect(screen.queryByText(/dari 24 baru/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Foto berikutnya" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("region", { name: "Momen" }), { key: "ArrowRight" });
    // Only the screen reader hears where it is.
    expect(screen.getByText("Foto ke-4 dari 24 foto baru").className).toMatch(/sr/);
    expect(screen.getByRole("group", { name: /^Foto ke-4 dari 24 foto baru/ })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("region", { name: "Momen" }), { key: "ArrowLeft" });
    expect(screen.getByRole("group", { name: /^Foto ke-3 dari 24 foto baru/ })).toBeTruthy();
  });

  it("shows the reactions a photo got as one small pill inside it (three avatars and the number), and eight plain emoji under it", () => {
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    const front = screen.getByRole("group", { name: /^Foto ke-3 dari 24 foto baru/ });
    const button = within(front).getByRole("button", { name: "24 reaksi. Ketuk untuk melihat siapa saja" });
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(within(button).queryAllByRole("button")).toHaveLength(0);
    expect(total()).toBe("24");
    // The server named nobody here: three round emoji stand in for the avatars.
    expect(button.querySelectorAll('[class*="avs"] > *')).toHaveLength(3);
    const row = screen.getByRole("group", { name: "Reaksi cepat" });
    expect(within(row).getAllByRole("button").map(item => item.getAttribute("aria-label"))).toEqual([HEART, "😂", "🔥", "👏", "😮", "🥹", "🎉", "👍"].map(emoji => `Reaksi ${emoji}`));
    expect(screen.queryByRole("button", { name: "Pilih reaksi lain" })).toBeNull();
    expect(row.parentElement!.className).toContain("actions");
  });

  it("the avatars are the people the server named, the viewer first while their reaction is on it (at most three)", () => {
    const people = ["Sari", "Budi", "Citra", "Dewi"].map((name, index) => ({ id: `p${index}`, name, photo: null }));
    const reactions = [{ emoji: HEART, count: 6, mine: true }, { emoji: "🔥", count: 2, mine: false }];
    const items = sampleFeedSemua.map((photo, index) => (index === 2 ? { ...photo, reactions, reactors: people.slice(0, 3) } : photo));
    render(<ToastProvider><MomenStack {...props} items={items} me={{ name: "Rani", photo: null }} /></ToastProvider>);
    const avatars = [...pillsButton().querySelectorAll('[class*="avs"] > *')].map(item => item.textContent);
    expect(avatars).toEqual(["R", "S", "B"]);
    expect(total()).toBe("8");
  });

  it("reacts at once (optimistic) with one of the eight, the number goes up, the others step back, and the server is asked", async () => {
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    expect(mineQuick("😮")).toBe(false);
    fireEvent.click(quick("😮"));
    expect(total()).toBe("25");
    expect(mineQuick("😮")).toBe(true);
    expect(quick("🔥").hasAttribute("data-dim")).toBe(true);
    expect(quick("😮").hasAttribute("data-dim")).toBe(false);
    expect(document.body.textContent).toContain("Kamu bereaksi 😮");
    await waitFor(() => expect(request).toHaveBeenCalledWith(mainWamApi.photoReaction(sampleFeedSemua[2].id), { method: "PUT", json: { emoji: "😮" } }));
  });

  it("a second tap on the same emoji takes the reaction back (DELETE)", async () => {
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    fireEvent.click(quick("😮"));
    fireEvent.click(quick("😮"));
    expect(total()).toBe("24");
    expect(mineQuick("😮")).toBe(false);
    expect(quick("🔥").hasAttribute("data-dim")).toBe(false);
    expect(document.body.textContent).toContain("Reaksimu dibatalkan");
    await waitFor(() => expect(request).toHaveBeenLastCalledWith(mainWamApi.photoReaction(sampleFeedSemua[2].id), { method: "DELETE" }));
  });

  it("one reaction per person: another emoji replaces the first (the number does not grow, only one is chosen)", () => {
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    fireEvent.click(quick(HEART));
    expect(total()).toBe("25");
    fireEvent.click(quick("🔥"));
    expect(total()).toBe("25");
    expect(mineQuick("🔥")).toBe(true);
    expect(mineQuick(HEART)).toBe(false);
    expect(screen.getAllByRole("button", { pressed: true }).filter(button => /^Reaksi /.test(button.getAttribute("aria-label") ?? ""))).toHaveLength(1);
  });

  it("a tap on the pills does not react: it opens the list of who reacted with what (tabs Semua and each emoji)", async () => {
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    fireEvent.click(pillsButton());
    const sheet = await screen.findByRole("dialog", { name: "Reaksi · 24" });
    await within(sheet).findByRole("list");
    expect(request).toHaveBeenCalledWith(mainWamApi.photoReaction(sampleFeedSemua[2].id));
    expect(request.mock.calls.filter(call => (call[1] as { method?: string } | undefined)?.method)).toHaveLength(0);
    const tabs = within(sheet).getByRole("group", { name: "Saring reaksi" });
    expect(within(tabs).getAllByRole("button").map(item => item.textContent?.replace(/\s+/g, " ").trim())).toEqual(["Semua 24", "❤️ 12", "🔥 5", "👏 4", "😂 3"]);
    // A row: the name, the department's short form under it, the emoji at the end.
    const first = within(sheet).getAllByRole("listitem")[0];
    expect(first.textContent).toMatch(/^[A-Za-z]+[A-Z]{2,4}/);
    expect(within(tabs).getByRole("button", { name: /^Semua/ }).getAttribute("aria-pressed")).toBe("true");
    expect(within(sheet).getAllByRole("listitem")).toHaveLength(24);
    fireEvent.click(within(tabs).getByRole("button", { name: /😂 3 reaksi/ }));
    const rows = within(sheet).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.textContent).toContain("😂");
  });

  it("in the list one's own row says Kamu, and a tap on it takes the reaction back (the row goes, the pills follow)", async () => {
    const items = sampleFeedSemua.map((photo, index) => (index === 2 ? { ...photo, reactions: sampleReactions(24, HEART) } : photo));
    request.mockImplementationOnce(async () => ({ data: { reactors: sampleReactors(sampleReactions(24, HEART)) }, message: "" }));
    render(<ToastProvider><MomenStack {...props} items={items} /></ToastProvider>);
    fireEvent.click(pillsButton());
    const sheet = await screen.findByRole("dialog", { name: "Reaksi · 24" });
    await within(sheet).findByRole("list");
    const mine = within(sheet).getByRole("button", { name: "Hapus reaksimu ❤️" });
    expect(mine.textContent).toContain("Rani · Kamu");
    expect(mine.textContent).toContain("Ketuk untuk menghapus");
    // Another person's row is not a button.
    expect(within(sheet).getAllByRole("button").filter(item => /^Hapus reaksimu/.test(item.getAttribute("aria-label") ?? ""))).toHaveLength(1);
    fireEvent.click(mine);
    expect(within(sheet).queryByRole("button", { name: "Hapus reaksimu ❤️" })).toBeNull();
    expect(within(sheet).getAllByRole("listitem")).toHaveLength(23);
    await waitFor(() => expect(request).toHaveBeenCalledWith(mainWamApi.photoReaction(sampleFeedSemua[2].id), { method: "DELETE" }));
    // The server's answer (the photo's reactions without the person's) replaces the guess.
    expect(total()).toBe("24");
  });

  it("the list says when it is loading, empty or could not load (and tries again)", async () => {
    request.mockImplementationOnce(async () => { throw new Error("Gagal."); });
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    fireEvent.click(pillsButton());
    const sheet = await screen.findByRole("dialog", { name: "Reaksi" });
    expect(await within(sheet).findByText("Daftar reaksi belum bisa dimuat.")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Coba lagi" }));
    await within(sheet).findByRole("list");
    expect(within(sheet).getAllByRole("listitem")).toHaveLength(24);
  });

  it("puts the number back and says so when the server refuses (rollback)", async () => {
    request.mockImplementationOnce(async () => { throw new Error("Gagal."); });
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    fireEvent.click(quick("😮"));
    expect(total()).toBe("25");
    await waitFor(() => expect(total()).toBe("24"));
    expect(mineQuick("😮")).toBe(false);
    expect(screen.getByText("Gagal.")).toBeTruthy();
  });

  it("has no \"+\" and no sheet of other emoji: eight, and one tap", () => {
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    expect(screen.queryByRole("button", { name: "Pilih reaksi lain" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(screen.getByRole("group", { name: "Reaksi cepat" })).getAllByRole("button")).toHaveLength(8);
  });

  it("a double tap on the photo is the red heart, once (a third tap does not take it back)", async () => {
    render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    const card = screen.getByRole("group", { name: /^Foto ke-3 dari 24 foto baru/ });
    fireEvent.click(card); fireEvent.click(card);
    expect(total()).toBe("25");
    expect(mineQuick(HEART)).toBe(true);
    fireEvent.click(card); fireEvent.click(card);
    expect(total()).toBe("25");
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  });

  it("on one's own photo (it shows once, unseen, in the stack): the pills open the list too, but no quick row, no heart button, the Fotomu pill", async () => {
    const items = sampleFeedSemua.map((photo, index) => (index === 2 ? { ...photo, mine: true, reactions: sampleReactions(7) } : photo));
    render(<ToastProvider><MomenStack {...props} items={items} total={24} startIndex={2} /></ToastProvider>);
    expect(screen.getByText("Fotomu")).toBeTruthy();
    const button = within(screen.getByRole("group", { name: /^Foto ke-3 dari 24 foto baru/ })).getByRole("button", { name: "7 reaksi pada fotomu. Ketuk untuk melihat siapa saja" });
    expect(total()).toBe("7");
    expect(screen.queryByRole("group", { name: "Reaksi cepat" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Reaksi / })).toBeNull();
    expect(screen.queryByRole("button", { name: /Suka/ })).toBeNull();
    fireEvent.click(button);
    expect(await screen.findByRole("dialog", { name: /^Reaksi/ })).toBeTruthy();
    expect(request.mock.calls.filter(call => (call[1] as { method?: string } | undefined)?.method)).toHaveLength(0);
    expect(screen.queryByText("Sudah kamu lihat")).toBeNull();
    cleanup();
    render(<ToastProvider><MomenStack {...props} items={items} total={24} startIndex={1} /></ToastProvider>);
    expect(screen.getByRole("group", { name: /^Foto ke-2 dari 24 foto baru/ })).toBeTruthy();
    expect(screen.queryByText("Fotomu")).toBeNull();
  });

  it("a photo nobody reacted to has no pills, and one's own keeps the same height of row under it (the card does not jump)", () => {
    const items = sampleFeedSemua.map((photo, index) => (index === 2 ? { ...photo, mine: true, reactions: [] } : photo));
    const { container } = render(<ToastProvider><MomenStack {...props} items={items} total={24} startIndex={2} /></ToastProvider>);
    expect(screen.queryByRole("button", { name: /Ketuk untuk melihat siapa saja/ })).toBeNull();
    expect(container.querySelector('[class*="actions"]')).toBeTruthy();
  });

  it("no kelompok anywhere: the owner's pill says the name and the time, no lock", () => {
    const { container } = render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    expect(container.textContent).not.toMatch(/Kelompok/);
    const info = container.querySelector('[class*="who"]')!;
    expect(info.textContent).toBe("Dimas10.02");
    expect(container.querySelector("svg.lucide-lock")).toBeNull();
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
    expect(screen.getAllByRole("link", { name: "Ambil foto" })[0].getAttribute("href")).toBe("/wam2026/momen/kamera");
  });

  it("says there is nothing new when every photo was seen: an invitation to the camera only (no Galeri, and the Mozaik is not repeated here: owner 25 Nov)", () => {
    render(<ToastProvider><MomenStack {...props} items={sampleFeedSemua.slice(0, 5)} startIndex={5} total={5} /></ToastProvider>);
    expect(screen.getByRole("heading", { name: "Kamu sudah lihat semua" })).toBeTruthy();
    expect(screen.getByText("Foto baru dari rekan muncul di sini.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Buka Galeri" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Lihat Mozaik" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "Ambil foto" }).some(link => link.getAttribute("href") === "/wam2026/momen/kamera")).toBe(true);
  });

  it("a photo the server still sends as seen is not in the stack (an older database), and the start follows the photos left", () => {
    const items = sampleFeedSemua.map((photo, index) => (index === 1 ? { ...photo, seen: true } : photo));
    render(<ToastProvider><MomenStack {...props} items={items} total={23} startIndex={2} /></ToastProvider>);
    // Photo 2 left, so what was third is second now: "2 dari 23 baru".
    expect(screen.getByRole("group", { name: /^Foto ke-2 dari 23 foto baru/ })).toBeTruthy();
    expect(screen.queryByText("Sudah dilihat")).toBeNull();
  });

  it("opened at one photo (a toast, a note) it may show a photo seen before, marked \"Sudah dilihat\", without putting it in the regular stack", () => {
    const items = sampleFeedSemua.map((photo, index) => (index === 2 ? { ...photo, seen: true } : photo));
    render(<ToastProvider><MomenStack {...props} mode="galeri" items={items} total={24} startIndex={2} /></ToastProvider>);
    expect(screen.getByText("Sudah dilihat")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("region", { name: "Momen" }), { key: "ArrowRight" });
    expect(screen.queryByText("Sudah dilihat")).toBeNull();
  });

  it("has no message or comment anywhere (postponed): no field, no button, no word", () => {
    const { container } = render(<ToastProvider><MomenStack {...props} /></ToastProvider>);
    expect(container.querySelector("textarea, input[type=text], input:not([type])")).toBeNull();
    expect(screen.queryByRole("button", { name: /komentar|pesan|balas|kirim/i })).toBeNull();
    expect(container.textContent).not.toMatch(/komentar|pesan|balas/i);
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
  it("the front card is centred (left margin = right margin) and the eight emoji lie 4 × 2 with even gaps, wrapping by their own width", () => {
    expect(css).toMatch(/\.pile \{[^}]*margin-left: calc\(\(100cqw - var\(--w\)\) \/ 2\)/);
    expect(css).toMatch(/\.deck\[data-panel\] \.pile \{ --w: 100cqw;/);
    expect(css).toMatch(/\.actions \{ container-type: inline-size;/);
    const reactions = readFileSync(join(process.cwd(), "src/components/main-wam/momen/reactions.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    // Plain emoji, no card: no background of their own, 44 targets, 4 columns, then 3 and 2 when the row is narrow (room for three rows).
    expect(reactions).toMatch(/\.quick \{[^}]*grid-template-columns: repeat\(4, 1fr\);[^}]*justify-items: center/);
    expect(reactions).toMatch(/\.quickButton \{[^}]*width: var\(--mw-touch\);[^}]*height: var\(--mw-touch\);[^}]*background: none/);
    expect(reactions).toMatch(/@container \(max-width: 199px\) \{ \.quick \{ grid-template-columns: repeat\(3, 1fr\); \} \}/);
    expect(reactions).not.toMatch(/\.quickButton \{[^}]*background: var\(--mw-surface/);
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
  it("the reactions sit inside the photo, bottom left, as ONE button: three tightly overlapped avatars and the number; the owner's pill is at the top", () => {
    const reactions = readFileSync(join(process.cwd(), "src/components/main-wam/momen/reactions.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(reactions).toMatch(/\.sum \{[^}]*position: absolute;[^}]*left: var\(--mw-space-4\);[^}]*bottom: var\(--mw-space-4\)[^}]*height: var\(--mw-touch\)/);
    expect(reactions).not.toMatch(/wrap-reverse/);
    expect(reactions).toMatch(/\.avs > \* \+ \* \{ margin-left: -10px; \}/);
    expect(reactions).toMatch(/\.sumCount \{[^}]*color: var\(--mw-media-on\)/);
    expect(reactions).toMatch(/\.avs > :nth-child\(1\) \{ z-index: 3; \}/);
    expect(reactions).toMatch(/@media \(prefers-reduced-motion: reduce\)[^]*\.sum, \.quickButton \{ transition: none; \}/);
    // The cards behind lie at a tilt of their own; the front one is straight; reduced motion keeps the tilt but not the move.
    expect(css).toMatch(/\.card\[data-place="next"\] \{[^}]*rotate\(var\(--tilt/);
    expect(css).toMatch(/\.card\[data-place="later"\] \{[^}]*rotate\(var\(--tilt/);
    expect(css).toMatch(/\.card\[data-place="front"\] \{ transform: rotate\(-2deg\); \}/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^@]*\.card \{ transition: none; \}/);
    expect(css).toMatch(/\.info \{[^}]*top: var\(--mw-space-12\)/);
    expect(css).not.toMatch(/\.info \{[^}]*bottom:/);
    expect(css).toMatch(/\.options \{[^}]*top: var\(--mw-space-4\);[^}]*right: var\(--mw-space-4\)/);
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

  it("has no session chip and no sheet to choose a session; the shutter says the photo goes to everyone (the tag stays behind the scenes)", () => {
    render(camera({ phase: "kamera", live: "contoh" }));
    expect(screen.getByRole("button", { name: "Ambil foto, langsung terkirim ke semua peserta" })).toBeTruthy();
    expect(screen.queryByText("Team building")).toBeNull();
    expect(screen.queryByRole("button", { name: /Sesi|Hapus tag sesi|Untuk:/ })).toBeNull();
    expect(document.body.textContent).not.toMatch(/Sesi:|Kelompokku|Untuk:|Tag sesi/);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps only the shutter, the flip and the gallery button under the viewfinder: Sign and Warna moved to the editor (KONTRAK §40), and nothing is drawn over the picture", () => {
    const { container } = render(camera({ phase: "kamera", live: "contoh" }));
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(container.querySelector("svg[data-sign]")).toBeNull();
    expect((container.querySelector("[role=img]") as HTMLElement).style.filter).toBe("");
    expect(screen.getByRole("button", { name: "Pilih dari galeri" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Balik kamera" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ambil foto/ })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Periksa fotomu" })).toBeNull();
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
  it("T-M02: the stack filtered to a session without photos offers every session too", () => {
    render(<ToastProvider><MomenStack mode="sesi" session={sampleSessionIds.bns} sessionTitle="Batu Night Spectacular" items={[]} next={null} total={0} startIndex={0} offset={0}
      mozaik migrated anyPhotos={false} own={null} eventName="WAM 2026" nowIso={now.toISOString()} demo={{}} /></ToastProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Semua sesi" }));
    expect(replace).toHaveBeenCalledWith("/wam2026/momen", { scroll: false });
  });

  it("M3: Hapus foto of a nominated photo (409) closes the dialog and says why", async () => {
    request.mockImplementationOnce(async () => { throw Object.assign(new Error("Foto ini masuk nominasi Awarding, jadi tidak bisa dihapus."), { name: "PraWamApiError", status: 409 }); });
    const mine = { ...sampleFeedSemua[0], mine: true };
    render(<ToastProvider><Mosaic initial={sampleMosaic()} mark={false} title="Mozaik WAM 2026" demo={false} own={[mine]} ownTotal={1} /></ToastProvider>);
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
    // Always reachable (the keyboard zooms with + and −); the zoom button shows only once zoomed in.
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(screen.queryByRole("button", { name: "Perkecil" })).toBeNull();
    rerender(<MosaicCanvas manifest={sampleMosaic()} mark={false} zoom={2} onZoom={() => undefined} focus={null} label="Mozaik" />);
    expect(screen.getByRole("region", { name: "Kanvas mozaik" }).getAttribute("tabindex")).toBe("0");
  });

  it("T-M05: while Momen loads, the Foto button holds its place beside the title", () => {
    const slot = document.createElement("div");
    document.body.append(slot);
    render(<ActionsSlotContext.Provider value={slot}><StackSkeleton /></ActionsSlotContext.Provider>);
    expect(slot.querySelectorAll("[aria-hidden] > *")).toHaveLength(1);
    slot.remove();
  });

  it("M06: the progress is a gold bar whose value is spoken", () => {
    render(<ToastProvider><Mosaic initial={sampleMosaic()} mark={false} title="Mozaik WAM 2026" demo /></ToastProvider>);
    const bar = screen.getByRole("progressbar"); expect(bar.getAttribute("aria-valuetext")).toMatch(/%$/);
  });
});

describe("the Mozaik", () => {
  it("marks one's own photos with numbers and where they are", () => {
    render(<ToastProvider><Mosaic initial={sampleMosaic()} mark={false} title="Mozaik WAM 2026" demo /></ToastProvider>);
    expect(screen.getByText("4 fotomu ada di mozaik")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Mozaik WAM 2026, 936 dari 1.800 foto");
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("list", { name: "Fotomu di mozaik" }).querySelectorAll("li")).toHaveLength(4);
    // "Lihat foto" opens the viewer in place (no address to a gallery or the stack).
    expect(screen.queryByRole("link", { name: "Lihat foto" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Lihat foto" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(window.location.search).toBe("?tandai=1");
  });
});

describe("the Mozaik canvas draws the prototype's grid", () => {
  type Rect = { alpha: number };
  function record() {
    const fills: Rect[] = [], strokes: number[] = [];
    const context = new Proxy({ globalAlpha: 1 } as Record<string, unknown>, {
      get: (target, key: string) => key === "fillRect" ? () => fills.push({ alpha: target.globalAlpha as number })
        : key === "strokeRect" ? () => strokes.push(1) : key in target ? target[key] : () => undefined,
      set: (target, key: string, value) => { target[key] = value; return true; },
    });
    HTMLCanvasElement.prototype.getContext = (() => context) as never;
    return { fills, strokes };
  }
  const sized = () => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 340 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 245 });
  };
  afterEach(() => { HTMLCanvasElement.prototype.getContext = (() => null) as never; delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth; delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight; });

  it("with no photo at all, every letter cell is still drawn (full alpha) over a fainter grid, and nothing is ringed", async () => {
    sized();
    const manifest = sampleMosaic(0, 0);
    const letters = [...manifest.cells].filter(cell => cell !== ".").length;
    const { fills, strokes } = record();
    render(<MosaicCanvas manifest={manifest} mark={false} zoom={1} onZoom={() => undefined} focus={null} label="Mozaik" />);
    await waitFor(() => expect(fills.length).toBe(manifest.columns * manifest.rows));
    expect(fills.filter(fill => fill.alpha === 1)).toHaveLength(letters);
    expect(fills.filter(fill => fill.alpha < 1)).toHaveLength(manifest.columns * manifest.rows - letters);
    expect(strokes).toHaveLength(0);
  });

  it("Tandai fotoku rings each of one's own cells and does not dim the rest", async () => {
    sized();
    const manifest = sampleMosaic(0.52, 4);
    const { fills, strokes } = record();
    render(<MosaicCanvas manifest={manifest} mark zoom={1} onZoom={() => undefined} focus={null} label="Mozaik" />);
    await waitFor(() => expect(strokes).toHaveLength(manifest.mine));
    expect(manifest.mine).toBe(4);
    expect(fills.some(fill => fill.alpha === 0.4)).toBe(false);
  });
});
