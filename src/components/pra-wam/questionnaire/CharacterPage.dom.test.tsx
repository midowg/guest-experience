import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { CardView } from "@/lib/server/pra-wam/cards";
import { CharacterPage } from "./CharacterPage";

// next/font only runs inside Next's compiler; jsdom has no canvas, so the drawing is a stand-in.
vi.mock("./font", () => ({ display: { variable: "", style: { fontFamily: "a" } }, body: { variable: "", style: { fontFamily: "b" } } }));
vi.mock("./cardArt", () => {
  const canvas = { toDataURL: () => "data:image/png;base64,AAAA" };
  return { drawFront: vi.fn(async () => canvas), drawBack: vi.fn(async () => canvas), drawWallpaper: vi.fn(async () => canvas), drawAvatar: vi.fn(async () => canvas), blobOf: vi.fn(async () => new Blob(["x"], { type: "image/png" })) };
});
afterEach(() => cleanup());

const card: CardView = {
  serial: 12, trial: false, dna: "a1b2c3d4e5", drawnAt: "2026-11-16T03:00:00.000Z",
  character: { id: "c1", key: "garda", name: "Garda Depan", figure: "", class: "Garda Depan", title: "Yang maju duluan", description: "", powers: [], image: null, partner: null },
  tier: { key: "rare", name: "Rare", color: "#449DFF", line: "", odds: 1800, sort: 2 },
  background: { number: 1, name: "", image: null }, accent: { number: 1, name: "", image: null }, stickers: [],
  figure: { id: "f", key: "jeanne-darc", name: "Jeanne d'Arc", costume: "Baju zirah perak", quote: null, image: null, legend: false, legendClass: null },
  reason: null, colors: ["#C2303F", "#6E1023"],
};

it("is the page of my tokoh only: the card, in its colours, and a button to my answers; no sections or done notice", async () => {
  window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { container } = render(<CharacterPage formId="f1" card={card} nickname="Dewi" hasPhoto={false} home="/wam" answers="/wam/kuesioner/jawaban" />);
  expect(await screen.findByText("Jeanne d'Arc")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Lihat jawaban kuesionermu/ }).getAttribute("href")).toBe("/wam/kuesioner/jawaban");
  expect(screen.getByRole("link", { name: /Beranda/ }).getAttribute("href")).toBe("/wam");
  expect(screen.queryByText(/Kuesionermu sudah selesai/)).toBeNull();
  expect(screen.queryByRole("list", { name: "Bagian kuesioner" })).toBeNull();
  // The card's colours: the persona's red, deep at the top.
  const page = container.querySelector("[class*='charPage']") as HTMLElement;
  expect(page.style.getPropertyValue("--stage-tone")).toBe("#C2303F");
  expect(page.style.getPropertyValue("--tone-deep")).toBe("#6E1023");
});
