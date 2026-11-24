import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { sampleMissions, sampleReviewQueue } from "@/lib/main-wam/misi/sample";
import { DEFAULT_MISSION_SETTINGS } from "@/lib/main-wam/misi/types";
import { mainWamAdminApi } from "@/lib/routes";
import type { AdminMisi } from "@/lib/server/main-wam/misi/admin";

const request = vi.fn();
vi.mock("@/components/admin/shared/api", async importOriginal => ({ ...(await importOriginal<object>()), adminRequest: (...args: unknown[]) => request(...args) }));
const { MissionsAdmin } = await import("./MissionsAdmin");

afterEach(() => { cleanup(); request.mockReset(); vi.restoreAllMocks(); });

const data = (over: Partial<AdminMisi> = {}): AdminMisi => ({
  migrated: true, settings: DEFAULT_MISSION_SETTINGS, missions: sampleMissions.map(mission => ({ ...mission, done: 0, pending: 0, rejected: 0 })), completions: [], reviewQueue: sampleReviewQueue(),
  leaderboard: [], manual: [], sessions: [], people: [], ...over,
});
const open = (tab: RegExp) => fireEvent.click(screen.getByRole("button", { name: tab }));

it("lists the missions with their TNC as chips (the place by name, the BOD tag, the tries)", () => {
  render(<MissionsAdmin initial={data()} />);
  const card = screen.getByRole("heading", { name: "Foto bareng KEDUA BOD" }).closest("section")!;
  for (const chip of ["Foto langsung", "Tag 2 BOD", "Wajah jelas", "Maks 3 kali"]) expect(card.textContent).toContain(chip);
  expect(screen.getByRole("heading", { name: "Foto plank di Jatim Park" }).closest("section")!.textContent).toContain("Di Jatim Park, Batu (contoh)");
});

it("starts a new mission from a template: name, points and every rule are filled, and the form is sent as photo rules", async () => {
  request.mockResolvedValue({ message: "Misi dibuat.", data: data() });
  render(<MissionsAdmin initial={data({ missions: [] })} />);
  fireEvent.click(screen.getByRole("button", { name: "Tambah misi" }));
  fireEvent.change(screen.getByLabelText("Mulai dari templat"), { target: { value: "bod-berdua" } });
  expect((screen.getByLabelText("Nama misi") as HTMLInputElement).value).toBe("Foto bareng KEDUA BOD");
  expect((screen.getByLabelText("Poin") as HTMLInputElement).value).toBe("150");
  expect((screen.getByLabelText("Jumlah orang") as HTMLInputElement).value).toBe("2");
  expect((screen.getByLabelText("Siapa yang ditandai") as HTMLSelectElement).value).toBe("bod");
  expect((screen.getByLabelText("Batas kirim per orang (kosong = tanpa batas)") as HTMLInputElement).value).toBe("3");
  fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
  await waitFor(() => expect(request.mock.calls.some(([url, init]) => url === mainWamAdminApi.missions && init?.method === "POST")).toBe(true));
  const body = JSON.parse(request.mock.calls.find(([url, init]) => url === mainWamAdminApi.missions && init?.method === "POST")![1].body);
  expect(body).toMatchObject({ title: "Foto bareng KEDUA BOD", kind: "foto", points: 150, latitude: null, rules: [{ type: "foto_langsung" }, { type: "tag", count: 2, relation: "bod", required: true }, { type: "pose", label: "Wajah jelas" }, { type: "batas_kali", times: 3 }] });
});

it("lets an admin fill the place, the tags, the pose, the hours and the limit of a mission by hand", () => {
  request.mockResolvedValue({ message: "ok", data: data() });
  render(<MissionsAdmin initial={data({ missions: [] })} />);
  fireEvent.click(screen.getByRole("button", { name: "Tambah misi" }));
  fireEvent.click(screen.getByLabelText("Harus di lokasi tertentu"));
  fireEvent.change(screen.getByLabelText("Nama tempat"), { target: { value: "Jatim Park" } });
  fireEvent.change(screen.getByLabelText("Garis lintang"), { target: { value: "-7,8856" } });
  fireEvent.change(screen.getByLabelText("Garis bujur"), { target: { value: "112.5296" } });
  fireEvent.click(screen.getByLabelText("Menandai orang di foto"));
  fireEvent.change(screen.getByLabelText("Siapa yang ditandai"), { target: { value: "sekamar" } });
  fireEvent.click(screen.getByLabelText("Pose atau benda yang harus tampak"));
  fireEvent.change(screen.getByLabelText("Label singkat"), { target: { value: "Pose plank" } });
  fireEvent.change(screen.getByLabelText("Apa yang harus tampak (dibaca pemeriksa)"), { target: { value: "Plank." } });
  fireEvent.click(screen.getByLabelText("Hanya berlaku pada jam tertentu"));
  fireEvent.change(screen.getByLabelText("Sampai (WIB)"), { target: { value: "2027-01-06T18:00" } });
  fireEvent.change(screen.getByLabelText("Nama misi"), { target: { value: "Plank" } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
  const body = JSON.parse(request.mock.calls.find(([, init]) => init?.method === "POST")![1].body);
  expect(body.rules).toEqual([
    { type: "foto_langsung" }, { type: "lokasi", name: "Jatim Park", latitude: -7.8856, longitude: 112.5296, radiusM: 100 }, { type: "tag", count: 1, relation: "sekamar", required: true },
    { type: "pose", label: "Pose plank", text: "Plank." }, { type: "waktu", start: null, end: "2027-01-06T18:00:00+07:00" }, { type: "batas_kali", times: 3 },
  ]);
});

it("shows the review queue with the big photo, the TNC with what the checks found, the tags and the verifier", () => {
  render(<MissionsAdmin initial={data()} />);
  expect(screen.getByRole("button", { name: "Tinjauan (3)" })).toBeTruthy();
  open(/Tinjauan/);
  const list = screen.getByRole("list", { name: "Antrean tinjauan" });
  const first = within(list).getAllByRole("listitem")[0];
  expect(within(first).getByRole("img", { name: /Foto Contoh Rani untuk Foto bareng KEDUA BOD/ }).getAttribute("src")).toBe("/wam/demo/foto-05.svg");
  expect(first.textContent).toContain("150 poin");
  expect(first.textContent).toContain("Contoh Arman (BOD), Contoh Wulan (BOD)");
  expect(first.textContent).toContain("Tandai 2 anggota BOD");
  expect(first.textContent).toContain("Terpenuhi");
  expect(first.textContent).toContain("Dinilai pemeriksa");
  expect(first.textContent).toContain("Pemeriksa (manual): Ragu");
  expect(first.textContent).toContain("percobaan 1 dari 3");
});

it("approves with one press, and rejects only with a reason the participant will read", async () => {
  request.mockResolvedValue({ message: "Disetujui.", data: data() });
  render(<MissionsAdmin initial={data()} />);
  open(/Tinjauan/);
  const rows = () => [...screen.getByRole("list", { name: "Antrean tinjauan" }).querySelectorAll<HTMLElement>(":scope > li")];
  fireEvent.click(within(rows()[0]).getByRole("button", { name: "Setujui" }));
  await waitFor(() => expect(request).toHaveBeenCalledWith(mainWamAdminApi.missionCompletion(sampleReviewQueue()[0].id), expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "disetujui", note: "" }) })));
  await waitFor(() => expect((within(rows()[1]).getByRole("button", { name: "Tolak" }) as HTMLButtonElement).disabled).toBe(false));
  const second = rows()[1];
  fireEvent.click(within(second).getByRole("button", { name: "Tolak" }));
  const reject = within(second).getAllByRole("button", { name: "Tolak" }).at(-1)!;
  expect((reject as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(within(second).getByLabelText(/Alasan menolak/), { target: { value: "Bukan plank." } });
  expect((reject as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(reject);
  await waitFor(() => expect(request).toHaveBeenCalledWith(mainWamAdminApi.missionCompletion(sampleReviewQueue()[1].id), expect.objectContaining({ body: JSON.stringify({ status: "ditolak", note: "Bukan plank." }) })));
});

it("says when nothing waits, and when the system waits for its update", () => {
  const { rerender } = render(<MissionsAdmin initial={data({ reviewQueue: [] })} />);
  open(/Tinjauan/);
  expect(screen.getByText("Tidak ada foto yang menunggu tinjauan.")).toBeTruthy();
  rerender(<MissionsAdmin initial={data({ reviewQueue: [], migrated: false })} />);
});
