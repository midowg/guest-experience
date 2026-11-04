import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  character: { id: "c1", name: "Urban DJ", figure: "Jaka", class: "Bard Penghibur", title: "Yang membuat kerja berat terasa ringan", description: "Humor dan keceriaanmu jadi bahan bakar tim.", powers: ["Humor", "Gampang akrab"], image: null, partner: { name: "Story Collector", class: "Penyembuh Hati" } },
  tier: { key: "epic", name: "Epic", color: "#C37BFF", line: "Langka. Sekitar 1 dari 14 orang.", odds: 700, sort: 3 },
  background: { number: 2, name: "Sunset Pink", image: null }, accent: { number: 1, name: "Sudut Magenta", image: null },
  stickers: [{ number: 1, name: "Bintang", image: null }],
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
