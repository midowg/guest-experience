import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CardView } from "@/lib/server/pra-wam/cards";
import { praWamApi } from "@/lib/routes";
import { CardReveal } from "./CardReveal";

// next/font only runs inside Next's compiler; jsdom has no canvas, so the drawing is a stand-in.
vi.mock("./font", () => ({ display: { variable: "", style: { fontFamily: "a" } }, body: { variable: "", style: { fontFamily: "b" } } }));
vi.mock("./cardArt", () => {
  const canvas = { toDataURL: () => "data:image/png;base64,AAAA" };
  return { drawFront: vi.fn(async () => canvas), drawBack: vi.fn(async () => canvas), drawWallpaper: vi.fn(async () => canvas), drawAvatar: vi.fn(async () => canvas), blobOf: vi.fn(async () => new Blob(["x"], { type: "image/png" })) };
});

const card: CardView = {
  serial: 7, trial: false, dna: "a1b2c3d4e5", drawnAt: "2026-11-04T10:00:00.000Z",
  character: { id: "c1", key: "penghibur", name: "Urban DJ", figure: "Jaka", class: "Bard Penghibur", title: "Yang membuat kerja berat terasa ringan", description: "Humor dan keceriaanmu jadi bahan bakar tim.", powers: ["Humor", "Gampang akrab"], image: null, partner: { name: "Story Collector", class: "Penyembuh Hati" } },
  tier: { key: "epic", name: "Epic", color: "#C37BFF", line: "Langka. Sekitar 1 dari 14 orang.", odds: 700, sort: 3 },
  background: { number: 2, name: "Sunset Pink", image: null }, accent: { number: 1, name: "Sudut Magenta", image: null },
  stickers: [{ number: 1, name: "Bintang", image: null }],
  figure: null, reason: null, colors: ["#F08A3C", "#A9461A"],
};

let posts: number;
beforeEach(() => {
  posts = 0;
  window.localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (url === praWamApi.questionnaireCard && init.method === "POST") posts++;
    return new Response(JSON.stringify({ ok: true, data: { card }, message: "Kartu siap." }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("asks the server for the card once, shows its back, and opens it with a tap", async () => {
  render(<CardReveal formId="f1" initial={null} nickname="Dewi" hasPhoto={false} />);
  expect(screen.getByText("Kartumu sedang dicetak")).toBeTruthy();
  const back = await screen.findByRole("button", { name: "Buka kartu karaktermu" });
  expect(posts).toBe(1);
  fireEvent.click(back);
  expect(await screen.findByText("Dewi, kamu Urban DJ")).toBeTruthy();
  expect(screen.getByText("Langka. Sekitar 1 dari 14 orang.")).toBeTruthy();
  expect(screen.getByText("#007")).toBeTruthy();
  expect(screen.getByText("DNA kartu a1b2c3d4e5")).toBeTruthy();
  expect(window.localStorage.getItem("wam-cq-card-open:f1")).toBe("1");
  expect(posts).toBe(1);
});

it("shows a card opened before on this device open, without asking for a new draw", async () => {
  window.localStorage.setItem("wam-cq-card-open:f1", "1");
  render(<CardReveal formId="f1" initial={card} nickname="Dewi" hasPhoto />);
  expect(await screen.findByText("Dewi, kamu Urban DJ")).toBeTruthy();
  expect(posts).toBe(0);
  expect(screen.getByRole("button", { name: /Pakai jadi foto profil/ })).toBeTruthy();
});

it("says plainly when the card cannot be drawn yet, and can try again", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, message: "Selesaikan dulu semua bagian wajib, lalu kartumu dibuka." }), { status: 409, headers: { "Content-Type": "application/json" } })));
  render(<CardReveal formId="f1" initial={null} nickname="Dewi" hasPhoto={false} />);
  expect(await screen.findByText("Selesaikan dulu semua bagian wajib, lalu kartumu dibuka.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Coba lagi" })).toBeTruthy();
});

it("opens a tokoh card: the figure, why, the persona, and the traits; it tilts with a finger, with holo from Rare up", async () => {
  const motion = (reduced: boolean) => { window.matchMedia = ((query: string) => ({ matches: reduced, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia; };
  // Printing and opening without waiting (reduced motion); the tilt is tried with motion on below.
  motion(true);
  window.localStorage.setItem("wam-cq-card-open:f2", "1");
  const tokoh: CardView = {
    ...card, character: { ...card.character, key: "garda", class: "Garda Depan", title: "Yang maju duluan", partner: { name: "Kirana", class: "Penyihir Ide" } },
    figure: { id: "f", key: "edmund-hillary", name: "Edmund Hillary", costume: "Jaket pendaki, kapak es", quote: null, image: null, legend: false, legendClass: null },
    reason: "Kamu dapat Edmund Hillary karena kamu tipe Garda Depan dan suka olahraga & outdoor.", colors: ["#C2303F", "#6E1023"],
  };
  const { container } = render(<CardReveal formId="f2" initial={tokoh} nickname="Dewi" hasPhoto={false} />);
  expect(await screen.findByText("Dewi, kamu dapat Edmund Hillary")).toBeTruthy();
  expect(screen.getByText(tokoh.reason!)).toBeTruthy();
  expect(screen.getByText("Figurnya: jaket pendaki, kapak es.")).toBeTruthy();
  expect(screen.getAllByText("Garda Depan").length).toBeGreaterThan(0);
  expect(screen.getByText("Rarity")).toBeTruthy();
  expect(screen.queryByText("Latar")).toBeNull();
  // Epic: shine and holo.
  expect(container.querySelector("[class*='holo']")).toBeTruthy();
  motion(false);
  const flip = container.querySelector("[class*='flip']") as HTMLDivElement;
  flip.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} });
  // jsdom has no PointerEvent with coordinates: a mouse event named pointermove stands in.
  act(() => { flip.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 100, clientY: 50 })); });
  expect(flip.dataset.tilt).toBe("1");
  expect(flip.style.getPropertyValue("--ry")).toBe("16.00deg");
  fireEvent.pointerLeave(flip);
  expect(flip.dataset.tilt).toBeUndefined();
  // Under reduced motion it stays still.
  motion(true);
  // jsdom has no PointerEvent with coordinates: a mouse event named pointermove stands in.
  act(() => { flip.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 100, clientY: 50 })); });
  expect(flip.dataset.tilt).toBeUndefined();
});

it("re-rolls the figure once, after asking, and shows the new card to open again (v3)", async () => {
  window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.localStorage.setItem("wam-cq-card-open:f3", "1");
  const base: CardView = {
    ...card, character: { ...card.character, key: "garda", class: "Garda Depan" },
    figure: { id: "f", key: "edmund-hillary", name: "Edmund Hillary", costume: "", quote: null, image: null, legend: false, legendClass: null },
    reason: "Kamu dapat Edmund Hillary karena kamu tipe Garda Depan.", colors: ["#C2303F", "#6E1023"],
    reroll: { state: "open", until: "2026-11-23T14:00:00.000Z" },
  };
  const next: CardView = { ...base, figure: { ...base.figure!, id: "g", key: "susi-susanti", name: "Susi Susanti" }, reason: "Kamu dapat Susi Susanti karena kamu tipe Garda Depan.", reroll: { state: "used", until: null } };
  let patches = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (url === praWamApi.questionnaireCard && init.method === "PATCH") patches++;
    return new Response(JSON.stringify({ ok: true, data: { card: next }, message: "Tokoh barumu: Susi Susanti." }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  const { container } = render(<CardReveal formId="f3" initial={base} nickname="Dewi" hasPhoto={false} />);
  expect(await screen.findByText("Kurang sreg dengan tokohmu?")).toBeTruthy();
  // Epic: the moving rarity layers and seven stars.
  expect(container.querySelector("[class*='edge']")).toBeTruthy();
  expect(container.querySelectorAll("[class*='spark'] i")).toHaveLength(7);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  // Re-roll opens a dialog; Kembali steps back without drawing.
  fireEvent.click(screen.getByRole("button", { name: /Re-roll tokoh \(1x\)/ }));
  expect(screen.getByRole("dialog", { name: "Re-roll tokoh" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Kembali" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(patches).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: /Re-roll tokoh \(1x\)/ }));
  fireEvent.click(screen.getByRole("button", { name: /Ya, undi ulang sekarang/ }));
  // The new card waits face down in the dialog; the page below still shows the old one.
  const flipNew = await screen.findByRole("button", { name: "Buka tokoh barumu" });
  expect(patches).toBe(1);
  expect(screen.queryByText(/Susi Susanti/)).toBeNull();
  expect(screen.getByText("Dewi, kamu dapat Edmund Hillary")).toBeTruthy();
  fireEvent.click(flipNew);
  expect(await screen.findByText("Dewi, tokoh barumu Susi Susanti")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Kembali" }));
  // Back on the page: the new card, open, and the re-roll used.
  expect(await screen.findByText("Dewi, kamu dapat Susi Susanti")).toBeTruthy();
  expect(screen.getByText(/Kamu sudah memakai jatah re-roll. Susi Susanti sekarang tokohmu/)).toBeTruthy();
  expect(screen.queryByText("Kurang sreg dengan tokohmu?")).toBeNull();
});
