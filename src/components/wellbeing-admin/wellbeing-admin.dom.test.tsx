import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { clearResources } from "@/components/app-shell/resource";
import { installAdminMock } from "./preview-mock";
import { WellbeingAdmin } from "./WellbeingAdmin";

/* Admin Wellbeing (17 Nov 2026) on the preview's sample answers: Konfirmasi many at once, Unduh Excel, Aplikasi karyawan. */

const route = vi.hoisted(() => ({ listeners: new Set<() => void>() }));
vi.mock("next/navigation", async () => {
  const React = await import("react");
  return {
    usePathname: () => React.useSyncExternalStore(listener => { route.listeners.add(listener); return () => { route.listeners.delete(listener); }; }, () => window.location.pathname),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  };
});

const BASE = "/dev-preview/wellbeing-admin";
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  window.matchMedia = (query: string) => ({ matches: query.includes("reduce"), media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } } as unknown as typeof IntersectionObserver;
  window.scrollTo = () => {};
  const notify = () => route.listeners.forEach(listener => listener());
  const push = window.history.pushState.bind(window.history);
  window.history.pushState = (...args: Parameters<History["pushState"]>) => { push(...args); notify(); };
  window.addEventListener("popstate", notify);
  installAdminMock();
});
beforeEach(() => clearResources("wb:"));
afterEach(() => { cleanup(); clearResources("wb:"); });

const open = (section: string) => {
  window.history.replaceState(null, "", section ? `${BASE}/${section}` : BASE);
  return render(<WellbeingAdmin person={{ name: "Admin uji" }} basePath={BASE} />);
};

describe("Admin Wellbeing", () => {
  it("confirms the ticked activities at once, and Urungkan sets exactly those back", async () => {
    open("periksa");
    await screen.findByRole("checkbox", { name: /^Pilih semua/ }, { timeout: 3000 });
    const before = screen.getAllByRole("checkbox", { name: /^Pilih aktivitas/ }).length;
    expect(before).toBeGreaterThan(2);
    // Two ticked by hand, then Konfirmasi.
    const boxes = screen.getAllByRole("checkbox", { name: /^Pilih aktivitas/ });
    fireEvent.click(boxes[0]); fireEvent.click(boxes[1]);
    expect(screen.getByText("2 dipilih")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Konfirmasi 2" }));
    expect(await screen.findByText("2 aktivitas ditandai sudah diperiksa.")).toBeTruthy();
    // Belum diperiksa: the two leave the list; nothing stays ticked.
    await waitFor(() => expect(screen.getAllByRole("checkbox", { name: /^Pilih aktivitas/ })).toHaveLength(before - 2));
    expect((screen.getByRole("checkbox", { name: /^Pilih semua/ }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Urungkan" }));
    expect(await screen.findByText("Dikembalikan ke belum diperiksa.")).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole("checkbox", { name: /^Pilih aktivitas/ })).toHaveLength(before));
  });

  it("keeps Periksa's texts whole: the department on its own line, units with their numbers, the full title and note (18 Nov 2026)", async () => {
    open("periksa");
    const card = (await screen.findAllByRole("article", { name: /^Dewi, Running/ }, { timeout: 3000 }))[0];
    // The name with the day and time beside it; the department alone under it (it may take two lines, never cut with the time).
    const department = within(card).getByText("Center of Excellence");
    expect(department.textContent).toBe("Center of Excellence");
    expect(within(card).getByText("Dewi").nextElementSibling?.textContent).toMatch(/^Hari ini/);
    // A number and its unit never part: no-break spaces, also before each dot.
    // (The raw text: the matcher's default would turn the no-break spaces into plain ones.)
    expect(within(card).getAllByText((_, element) => element?.tagName === "SPAN" && element.textContent === "Running · 412 kkal · 28 menit · 5,2 km")).toHaveLength(1);
    // The note is there in full, and the title carries its whole text as a tooltip.
    expect(within(card).getByText("“Lari pagi keliling Renon”")).toBeTruthy();
    const long = (await screen.findAllByTitle("Spa atau body treatment (Perawatan Wajah, Badan, Potong Rambut)"))[0];
    expect(long.textContent).toBe("Spa atau body treatment (Perawatan Wajah, Badan, Potong Rambut)");
  });

  it("opens Unduh Excel for the ticked activities, and says it when the file cannot be made", async () => {
    open("periksa");
    const boxes = await screen.findAllByRole("checkbox", { name: /^Pilih aktivitas/ }, { timeout: 3000 });
    fireEvent.click(boxes[0]);
    fireEvent.click(within(screen.getByRole("region", { name: "Pilihan" })).getByRole("button", { name: "Unduh Excel" }));
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("1 aktivitas yang dipilih di Periksa.")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Unduh Excel" }));
    // The preview has no server to make the file: the message shows in the panel.
    expect(await within(panel).findByText(/berkas Excel dibuat oleh server/)).toBeTruthy();
  });

  it("shows Periksa as Daftar, filters Jenis from the Filter menu, and lists the shortcuts on ? (18 Nov 2026)", async () => {
    open("periksa");
    await screen.findAllByRole("checkbox", { name: /^Pilih aktivitas/ }, { timeout: 3000 });
    expect(screen.getAllByText("Meditasi").length).toBeGreaterThan(0);
    // Daftar: one row each, the buttons as icons named for screen readers.
    fireEvent.click(screen.getByRole("button", { name: "Daftar" }));
    expect(screen.getByRole("button", { name: "Daftar" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByRole("button", { name: "Oke" }).length).toBeGreaterThan(0);
    // Jenis in the Filter menu: Olahraga leaves the daily ones out.
    fireEvent.click(screen.getByRole("button", { name: "Filter jenis: Semua jenis" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Jenis aktivitas" })).getByRole("menuitemradio", { name: /Olahraga/ }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Filter jenis: Olahraga" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Meditasi")).toBeNull());
    // "?" opens the shortcuts (not while typing in the search).
    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Cari nama atau divisi" }), { key: "?" });
    expect(screen.queryByRole("dialog", { name: "Pintasan keyboard" })).toBeNull();
    fireEvent.keyDown(document.body, { key: "?" });
    expect(screen.getByRole("dialog", { name: "Pintasan keyboard" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Kartu" }));
  });

  it("opens every proof of an activity in the viewer, one at a time (18 Nov 2026)", async () => {
    open("periksa");
    const proofs = await screen.findAllByRole("button", { name: /^Lihat (foto bukti|\d+ bukti)/ }, { timeout: 3000 });
    fireEvent.click(proofs[0]);
    const viewer = await screen.findByRole("dialog", { name: /bukti 1 dari \d+/ });
    expect(within(viewer).getByRole("link", { name: "Buka di tab baru" })).toBeTruthy();
    fireEvent.click(within(viewer).getByRole("button", { name: "Tutup" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /bukti 1 dari/ })).toBeNull());
  });

  it("chooses a report and its period in Laporan", async () => {
    open("laporan");
    const cards = await screen.findAllByRole("button", { name: "Unduh Excel" });
    expect(cards).toHaveLength(3);
    fireEvent.click(cards[1]);
    const panel = await screen.findByRole("dialog");
    expect((within(panel).getByRole("radio", { name: /Daftar aktivitas/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(panel).getByRole("button", { name: "Pilih tanggal" }));
    expect(within(panel).getByLabelText("Dari")).toBeTruthy();
    expect(within(panel).getByLabelText("Status")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Unduh Excel" }));
    expect(await within(panel).findByText("Isi tanggal mulai dan akhir.")).toBeTruthy();
  });

  it("saves the employee app's controls: announcement, prize, photo reading, pause", async () => {
    open("pengaturan");
    const show = await screen.findByRole("checkbox", { name: /Tampilkan pengumuman/ }, { timeout: 3000 });
    const save = screen.getByRole("button", { name: "Simpan pengaturan aplikasi" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(show);
    fireEvent.click(save);
    expect(await screen.findByText("Isi judul atau isi pengumuman, atau matikan pengumuman.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Judul"), { target: { value: "Balapan ditutup 30 Nov" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Jeda pencatatan/ }));
    fireEvent.change(screen.getByLabelText("Pesan untuk karyawan"), { target: { value: "Dibuka lagi Senin." } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan pengaturan aplikasi" }));
    expect(await screen.findByText("Pengaturan aplikasi karyawan disimpan.")).toBeTruthy();
  });
});
