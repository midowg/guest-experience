import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { faceProblem, FaceTablet, matchSpots } from "./FaceTablet";

afterEach(cleanup);
const now = Date.now();
const overview = { total: 40, withFace: 34, present: 23, opens: new Date(now - 60_000).toISOString(), closes: new Date(now + 3_600_000).toISOString() };
const base = { sessionId: "s", title: "Forum Komunikasi", when: "Senin, 10.00–12.00", backHref: "/kembali", overview };

it("starts with the counts, the camera choice and Mulai", () => {
  render(<FaceTablet {...base} />);
  expect(screen.getByRole("heading", { name: "Forum Komunikasi" })).toBeTruthy();
  expect(screen.getByText("34")).toBeTruthy();
  expect(screen.getByRole("radio", { name: /Depan/ })).toHaveProperty("checked", true);
  expect(screen.getByRole("button", { name: /Mulai/ })).toBeTruthy();
});

it("says when the check-in is not open yet", () => {
  render(<FaceTablet {...base} overview={{ ...overview, opens: new Date(now + 600_000).toISOString() }} />);
  expect(screen.getByRole("status").textContent).toMatch(/Absen dibuka/);
});

it("shows the answer on the camera, and a close call with a choice", () => {
  render(<FaceTablet {...base} demo={{
    faces: [{ id: 1, left: 10, top: 10, width: 100, height: 120, tone: "good", label: "Budi Santoso", main: true }],
    banners: [{ tone: "good", title: "Budi Santoso", text: "Tercatat hadir 09.42" }, { tone: "good", title: "Dewi Anggraini", text: "Tercatat hadir 09.43" }],
    confirm: { photoUrl: null, candidates: [{ employeeId: "a", name: "Budi Santoso", department: "Finance", percent: 71, referenceUrl: null, token: "t", upload: { key: "k", uploadUrl: "", token: "u" } }] },
    recent: [{ key: "1", name: "Ayu Lestari", department: "Comms", at: new Date(now).toISOString(), tone: "good" }], present: 24,
  }} />);
  const said = screen.getAllByRole("status").map(item => item.textContent ?? "").join(" ");
  expect(said).toMatch(/Budi Santoso.*Tercatat hadir 09.42/);
  expect(said).toMatch(/Dewi Anggraini.*Tercatat hadir 09.43/);
  expect(screen.getByText("24")).toBeTruthy();
  expect(screen.getByRole("dialog", { name: "Benar ini Budi Santoso?" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Ya, Budi/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Bukan, jangan catat" })).toBeTruthy();
  expect(screen.getByRole("complementary", { name: "Baru absen" }).textContent).toMatch(/Ayu Lestari/);
});

it("reads only a face near enough that looks at the tablet", () => {
  const signal = (yaw: number) => ({ t: 1, blinkLeft: 0, blinkRight: 0, smileLeft: 0, smileRight: 0, yaw });
  expect(faceProblem({ closeness: 0.05, signal: signal(0) }, 720)).toBeNull();
  expect(faceProblem({ closeness: 0.02, signal: signal(0) }, 720)).toBe("Mendekat sedikit");
  expect(faceProblem({ closeness: 0.05, signal: signal(35) }, 720)).toBe("Hadap ke kamera");
  expect(faceProblem({ closeness: 0.05, signal: null }, 720)).toBe("Hadap ke kamera");
});

it("follows each face by place and size, so a new person is a new face", () => {
  const a = { cx: 0.3, cy: 0.4, size: 0.2 }, b = { cx: 0.7, cy: 0.4, size: 0.2 };
  // Both moved a little: each keeps its own box.
  expect(matchSpots([a, b], [{ cx: 0.72, cy: 0.41, size: 0.21 }, { cx: 0.31, cy: 0.4, size: 0.19 }])).toEqual([1, 0]);
  // Someone far smaller (further back) in the same place, or a face elsewhere: not the same box.
  expect(matchSpots([a], [{ cx: 0.3, cy: 0.4, size: 0.08 }])).toEqual([-1]);
  expect(matchSpots([a], [{ cx: 0.8, cy: 0.8, size: 0.2 }])).toEqual([-1]);
  // Two faces near one box: only the nearer takes it.
  expect(matchSpots([a], [{ cx: 0.36, cy: 0.4, size: 0.2 }, { cx: 0.31, cy: 0.4, size: 0.2 }])).toEqual([-1, 0]);
});

it("has a full screen button while the camera runs, where the browser can do it", () => {
  const request = vi.fn(async () => undefined);
  Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: request });
  render(<FaceTablet {...base} demo={{ faces: [], banners: [], confirm: null, recent: [], present: 0 }} />);
  fireEvent.click(screen.getByRole("button", { name: "Layar penuh" }));
  expect(request).toHaveBeenCalledTimes(1);
  delete (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen;
});
