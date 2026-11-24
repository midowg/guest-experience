import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { sampleMissions, sampleReviewQueue } from "@/lib/main-wam/misi/sample";
import { DEFAULT_MISSION_SETTINGS } from "@/lib/main-wam/misi/types";
import { mainWamAdminApi } from "@/lib/routes";
import type { AdminMisi } from "@/lib/server/main-wam/misi/admin";

/* Admin WAM → Misi, detection from Momen photos: the mode of each mission and the badge and the reasons in the review queue. */

const request = vi.fn();
vi.mock("@/components/admin/shared/api", async importOriginal => ({ ...(await importOriginal<object>()), adminRequest: (...args: unknown[]) => request(...args) }));
const { MissionsAdmin } = await import("./MissionsAdmin");

afterEach(() => { cleanup(); request.mockReset(); });

const data = (over: Partial<AdminMisi> = {}): AdminMisi => ({
  migrated: true, settings: DEFAULT_MISSION_SETTINGS, missions: sampleMissions.map(mission => ({ ...mission, done: 0, pending: 0, rejected: 0 })), completions: [], reviewQueue: sampleReviewQueue(),
  leaderboard: [], manual: [], sessions: [], people: [], ...over,
});

it("tells on every photo mission whether detection from Momen is on: by default when its rules give evidence (a place or a required tag), off for a pose alone", () => {
  render(<MissionsAdmin initial={data()} />);
  const badge = (title: string) => within(screen.getByRole("heading", { name: title }).closest("section")!).getByText(/Deteksi dari Momen/).textContent;
  expect(badge("Foto bareng KEDUA BOD")).toBe("Deteksi dari Momen: Hanya yang pasti cocok (bawaan)");
  expect(badge("Foto plank di Jatim Park")).toBe("Deteksi dari Momen: Hanya yang pasti cocok (bawaan)");
  expect(badge("Petik apel di kebun apel Batu")).toBe("Deteksi dari Momen: Hanya yang pasti cocok (bawaan)");
});

it("the mode is saved with the mission, with a note on what the default is and why", async () => {
  request.mockResolvedValue({ message: "ok", data: data() });
  render(<MissionsAdmin initial={data()} />);
  const card = screen.getByRole("heading", { name: "Foto bareng KEDUA BOD" }).closest("section")!;
  fireEvent.click(within(card).getByRole("button", { name: "Ubah" }));
  const select = screen.getByLabelText("Deteksi otomatis dari foto Momen") as HTMLSelectElement;
  expect(select.value).toBe("");
  expect(within(select).getAllByRole("option").map(option => option.textContent)).toEqual(["Bawaan: Hanya yang pasti cocok", "Mati", "Hanya yang pasti cocok", "Termasuk yang mungkin cocok"]);
  expect(card.textContent).toContain("aktif bila misi punya syarat tempat atau tag wajib; mati bila hanya bergantung pada pose atau objek");
  fireEvent.change(select, { target: { value: "mati" } });
  expect(card.textContent).toContain("Foto Momen tidak pernah dikenali untuk misi ini");
  fireEvent.click(within(card).getByRole("button", { name: "Simpan" }));
  await waitFor(() => expect(request.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
  expect(JSON.parse(request.mock.calls.find(([, init]) => init?.method === "PATCH")![1].body)).toMatchObject({ autoDetect: "mati" });
});

it("a pose-only mission is off by default, and says so in the form", () => {
  render(<MissionsAdmin initial={data({ missions: [{ ...sampleMissions[0], title: "Hanya pose", rules: [{ type: "foto_langsung" }, { type: "pose", label: "Plank", text: "Plank." }], done: 0, pending: 0, rejected: 0 }] })} />);
  const card = screen.getByRole("heading", { name: "Hanya pose" }).closest("section")!;
  expect(within(card).getByText(/Deteksi dari Momen/).textContent).toBe("Deteksi dari Momen: Mati (bawaan)");
  fireEvent.click(within(card).getByRole("button", { name: "Ubah" }));
  expect(screen.getByLabelText("Deteksi otomatis dari foto Momen").textContent).toContain("Bawaan: Mati");
});

it("marks a proof that came from a regular Momen photo with a badge and shows why it was recognised, what held and what is left to the reviewer", () => {
  render(<MissionsAdmin initial={data()} />);
  fireEvent.click(screen.getByRole("button", { name: /Tinjauan/ }));
  const items = [...screen.getByRole("list", { name: "Antrean tinjauan" }).querySelectorAll<HTMLElement>(":scope > li")];
  expect(within(items[0]).queryByText("Otomatis dari Momen")).toBeNull();
  expect(within(items[0]).queryByText("Alasan deteksi", { exact: false })).toBeNull();
  const auto = items[1];
  expect(within(auto).getByText("Otomatis dari Momen")).toBeTruthy();
  expect(auto.textContent).toContain("Alasan deteksi");
  expect(auto.textContent).toContain("diajukan otomatis");
  expect(auto.textContent).toContain("Foto diambil di Jatim Park, Batu (contoh) (dalam radius 150 m)");
  expect(auto.textContent).toContain("Pose atau objek di foto: dinilai pemeriksa");
  // The person's tap on a suggestion is told apart from the app's own send.
  expect(items[2].textContent).toContain("diajukan peserta dari saran");
  expect(items[2].textContent).toContain("Lokasi foto tidak dibagikan, jadi belum bisa dicek");
  expect(items[2].textContent).toContain("belum bisa dipastikan sepenuhnya");
  // The proof is still approved or rejected the same way, with the photo opened from the same address.
  expect(within(auto).getByRole("button", { name: "Setujui" })).toBeTruthy();
  expect(within(auto).getByRole("img", { name: /Foto Contoh Sari untuk Foto plank/ })).toBeTruthy();
  void mainWamAdminApi;
});
