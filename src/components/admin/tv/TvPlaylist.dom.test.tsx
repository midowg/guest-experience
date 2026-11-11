import { readFileSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TV_DEFAULT_SETTINGS } from "@/lib/pra-wam/tv";
import type { TvAdmin, TvAdminItem } from "@/lib/server/pra-wam/tv";
import { TvPlaylist } from "./TvPlaylist";

afterEach(cleanup);

const always = { showFrom: null, showUntil: null, timeFrom: null, timeUntil: null, screenIds: [] as string[] };
const row = (id: string, kind: TvAdminItem["kind"], more: Partial<TvAdminItem> = {}): TvAdminItem => ({ id, kind, title: "", body: "", seconds: 15, active: true, slideId: null, design: "werkudara", videoFile: false, call: "", date: "", ...always, ...more });
const admin = (more: Partial<TvAdmin> = {}): TvAdmin => ({
  migrated: true, slugReady: true, lookReady: true, storageReady: true, now: "2026-11-10T03:00:00Z", slides: [], settings: TV_DEFAULT_SETTINGS,
  screens: [{ id: "lobi", name: "Lobi", slug: "lobi", keyHint: "", lastSeenAt: null, width: null, height: null, createdAt: "2026-11-10T00:00:00Z", lastItem: null, playsVideo: true }],
  items: [
    row("a", "kalender_hari"),
    row("b", "kalender_minggu", { active: false }),
    row("c", "sambutan"),
    row("d", "tamu", { title: "Contoh Satu", body: "Terima kasih sudah berkunjung ke kantor kami." }),
    row("f", "video", { title: "Annual Meeting 2025", body: "FWN1B1B7Gu8" }),
    row("e", "teks", { title: "Rapat bulanan pindah ke lantai dua mulai pekan depan", body: "Mohon perhatikan papan ruang.", showFrom: "2026-12-01", showUntil: "2026-12-10", timeFrom: "08:00", timeUntil: "17:00", screenIds: ["lobi"] }),
  ],
  welcomeReady: true, takeover: null, welcomes: ["PT Contoh Dua Sejahtera"], videoReady: true, ...more,
});
const show = (data = admin()) => render(<TvPlaylist initial={data} crumbs={["Admin TV", "Tayangan"]} title="Tayangan" />);

/*
 * With TV_PLAYLIST_HTML set to a folder, the rendered page is also written there as plain HTML with
 * the real stylesheets, to look at in a browser at a desktop's and a phone's width.
 */
/** The test run names a class "_plRow_15c4ec"; the stylesheets as written say ".plRow". */
const plain = (html: string) => html.replace(/_([A-Za-z][A-Za-z0-9]*)_[0-9a-f]{6}(?=[ "])/g, "$1");
function keep(name: string, container: HTMLElement) {
  const folder = process.env.TV_PLAYLIST_HTML;
  if (!folder) return;
  const sheets = ["src/app/globals.css", "src/components/console/console.module.css", "src/components/admin/wam/akun/akun.module.css", "src/components/admin/tv/tv-playlist.module.css"]
    .map(path => readFileSync(path, "utf8")).join("\n");
  writeFileSync(`${folder}/${name}.html`, `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title><style>${sheets}</style></head>`
    + `<body style="margin:0"><div class="themeAdmin canvas"><div class="panel"><div class="panelBody">${plain(container.innerHTML)}</div></div></div></body></html>`);
}

describe("Admin TV → Tayangan", () => {
  it("shows every row as a card to read: its source, its name, and its duration, TVs and schedule as facts", () => {
    const { container } = show();
    const cards = within(screen.getByRole("list", { name: "Tayangan, urut tayang" })).getAllByRole("listitem");
    expect(cards).toHaveLength(6);
    expect(within(cards[0]).getByRole("heading", { name: "Kalender hari ini" })).toBeTruthy();
    expect(cards[0].textContent).toContain("Dari WAM");
    expect(cards[0].textContent).toContain("Durasi15 detik");
    expect(cards[0].textContent).toContain("Tayang diSemua TV");
    expect(cards[0].textContent).toContain("JadwalSetiap hari, sepanjang hari");
    expect(cards[1].textContent).toContain("Disembunyikan");
    expect(cards[2].textContent).toContain("Hari ini: PT Contoh Dua Sejahtera");
    expect(cards[5].textContent).toContain("Tayang diLobi");
    expect(cards[5].textContent).toContain("Jadwal1 Des – 10 Des · 08.00–17.00");
    expect(screen.getByText("5 tayang dari 6")).toBeTruthy();
    expect(cards[4].textContent).toContain("DurasiSampai video selesai");
    // Each card opens with a drawing of its slide; a typed one shows its own words in it.
    expect(cards.every(card => !!card.querySelector("svg[viewBox='0 0 160 90']"))).toBe(true);
    expect(cards[3].querySelector("svg[viewBox='0 0 160 90']")?.textContent).toContain("Contoh Satu");
    keep("daftar", container);
  });

  it("keeps on a card only the arrows and Atur; the rest is inside Atur", () => {
    show();
    for (const name of ["Naikkan", "Turunkan", "Atur"]) expect(screen.getAllByRole("button", { name: new RegExp(`^${name} `) })).toHaveLength(6);
    expect((screen.getByRole("button", { name: "Naikkan Kalender hari ini" }) as HTMLButtonElement).disabled).toBe(true);
    for (const name of ["Simpan", "Hapus", "Sembunyikan", "Tayangkan sekarang"]) expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("opens one card at a time with its words, duration, schedule, TVs and actions", () => {
    const { container } = show();
    fireEvent.click(screen.getByRole("button", { name: "Atur Contoh Satu" }));
    expect((screen.getByLabelText("Nama tamu") as HTMLInputElement).value).toBe("Contoh Satu");
    expect((screen.getByLabelText("Durasi tayang") as HTMLSelectElement).value).toBe("15");
    // A typed welcome picks its design; it has no visit, so no cover photo to pick.
    const design = screen.getByLabelText("Desain layar") as HTMLSelectElement;
    expect(design.value).toBe("werkudara");
    expect([...design.options].map(option => option.value)).toEqual(["werkudara", "polos"]);
    for (const name of ["Simpan", "Hapus", "Sembunyikan", "Tayangkan sekarang"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tayangkan sekarang" }));
    expect((screen.getByLabelText("Lama") as HTMLSelectElement).value).toBe("15");
    expect(screen.getByRole("button", { name: "Mulai tayangkan" })).toBeTruthy();
    keep("sekarang", container);
    fireEvent.click(screen.getByRole("button", { name: /^Atur Rapat bulanan/ }));
    expect(screen.queryByLabelText("Nama tamu")).toBeNull();
    expect((screen.getByLabelText("Judul") as HTMLInputElement).value).toContain("Rapat bulanan");
    expect((screen.getByLabelText("Lobi") as HTMLInputElement).checked).toBe(true);
    keep("ubah", container);
    fireEvent.click(screen.getByRole("button", { name: /^Tutup Rapat bulanan/ }));
    expect(screen.queryByLabelText("Judul")).toBeNull();
  });

  it("offers Tayangkan lagi for a hidden card, and no Tayangkan sekarang before its migration", () => {
    show(admin({ welcomeReady: false }));
    fireEvent.click(screen.getByRole("button", { name: "Atur Kalender minggu ini" }));
    expect(screen.getByRole("button", { name: "Tayangkan lagi" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tayangkan sekarang" })).toBeNull();
    expect(screen.getByText(/menunggu migrasi 202611100008/)).toBeTruthy();
  });

  it("adds through one card with a choice of four, the templates not yet in the list first", () => {
    show();
    expect(screen.getByRole("button", { name: "Tambah Timeline Pra WAM" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tambah Kalender hari ini" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sambutan" }));
    const addGuest = screen.getByRole("button", { name: "Tambah sambutan" }) as HTMLButtonElement;
    expect(addGuest.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Nama tamu"), { target: { value: "Contoh Tiga" } });
    expect(document.querySelector("form svg[viewBox='0 0 160 90']")?.textContent).toContain("Contoh Tiga");
    expect(addGuest.disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Ulang tahun" }));
    const addBirthday = screen.getByRole("button", { name: "Tambah ucapan" }) as HTMLButtonElement;
    expect(addBirthday.disabled).toBe(true);
    // The photo is picked right here, before the greeting is added.
    expect(screen.getByRole("button", { name: "Pilih foto" })).toBeTruthy();
    expect((screen.getByLabelText("Ucapan") as HTMLTextAreaElement).value).toContain("May you always find happiness");
    expect((screen.getByLabelText("Tanggal ulang tahun") as HTMLInputElement).value).toBe("2026-11-10");
    fireEvent.change(screen.getByLabelText("Nama lengkap"), { target: { value: "Contoh Empat" } });
    fireEvent.change(screen.getByLabelText("Nama panggilan"), { target: { value: "Bu Contoh" } });
    expect(addBirthday.disabled).toBe(false);
    expect(document.querySelector("form svg[viewBox='0 0 160 90']")?.textContent).toContain("Happy Birthday Bu Contoh");
    fireEvent.click(screen.getByRole("button", { name: "Video" }));
    const addVideo = screen.getByRole("button", { name: "Tambah video" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Alamat video YouTube"), { target: { value: "https://example.com/video" } });
    expect(addVideo.disabled).toBe(true);
    expect(screen.getByText("Alamat ini bukan alamat video YouTube.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Alamat video YouTube"), { target: { value: "https://youtu.be/FWN1B1B7Gu8" } });
    expect(addVideo.disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Unggah berkas video" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Gambar" }));
    expect(screen.getByRole("button", { name: "Unggah gambar" })).toBeTruthy();
  });

  it("says at the top what takes the TVs over, with the way to stop it", () => {
    show(admin({ takeover: { itemId: "d", until: "2026-11-10T03:15:00Z", screenIds: [] } }));
    expect(screen.getByRole("status").textContent).toContain("Contoh Satu sedang mengambil alih semua TV, sampai 10.15 WIB");
    expect(screen.getByRole("button", { name: "Hentikan" })).toBeTruthy();
    expect(screen.getByText("Mengambil alih")).toBeTruthy();
  });
});
