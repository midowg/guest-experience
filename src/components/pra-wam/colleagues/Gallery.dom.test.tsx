import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { GalleryEntry } from "@/lib/server/pra-wam/colleagues";
import { Gallery } from "./Gallery";

vi.mock("../questionnaire/cardArt", () => ({ drawFront: vi.fn(async () => ({ toDataURL: () => "data:image/webp;base64,AAAA" })) }));
afterEach(cleanup);

const entry = (employeeId: string, name: string, department: string, character: string, serial: number): GalleryEntry => ({
  employeeId, name, department,
  card: {
    serial, trial: false, dna: "0123456789", drawnAt: "2026-11-04T10:00:00.000Z",
    character: { id: character, name: character, figure: "", class: "", title: "", description: "", powers: [], image: null, partner: null },
    tier: { key: "common", name: "Common", color: "#AEB7C7", line: "", odds: 4500, sort: 0 },
    background: { number: 1, name: "L1", image: null }, accent: { number: 1, name: "A1", image: null }, stickers: [],
  },
});
const entries = [
  entry("p1", "Ayu Lestari", "Comms", "Urban DJ", 1),
  entry("p2", "Budi Santoso", "Finance", "City Dreamer", 2),
  entry("p3", "Citra Dewi", "Comms", "Urban DJ", 3),
];

it("lists every card, marks the viewer's own, and links each to the profile", () => {
  render(<Gallery entries={entries} viewerId="p2" />);
  expect(screen.getByRole("status").textContent).toBe("3 kartu");
  const budi = screen.getByRole("link", { name: /Budi Santoso \(kamu\), City Dreamer, Common, kartu #002/ });
  expect(budi.getAttribute("href")).toBe("/wam/rekan/p2");
  expect(screen.getAllByRole("link")).toHaveLength(3);
});

it("filters by character and searches names, departments and characters", () => {
  render(<Gallery entries={entries} viewerId="p2" />);
  fireEvent.click(screen.getByRole("button", { name: "Urban DJ · 2" }));
  expect(screen.getByRole("status").textContent).toBe("2 dari 3 kartu");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "citra" } });
  expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/wam/rekan/p3"]);
  fireEvent.click(screen.getByRole("button", { name: "Semua · 3" }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "finance" } });
  expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/wam/rekan/p2"]);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "tidak ada" } });
  expect(screen.getByText("Tidak ada kartu yang cocok.")).toBeTruthy();
});
