import { readFileSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TV_DEFAULT_SETTINGS } from "@/lib/pra-wam/tv";
import type { TvAdmin, TvAdminItem } from "@/lib/server/pra-wam/tv";
import { TvPlaylist } from "./TvPlaylist";

afterEach(cleanup);
// jsdom has no modal dialogs: a sheet is open when it has the attribute.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

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
  const sheets = ["src/app/globals.css", "src/components/console/console.module.css", "src/components/admin/wam/akun/akun.module.css", "src/components/admin/wam-acara/isi/isi.module.css", "src/components/admin/tv/tv-playlist.module.css"]
    .map(path => readFileSync(path, "utf8")).join("\n");
  writeFileSync(`${folder}/${name}.html`, `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title><style>${sheets}</style></head>`
    + `<body style="margin:0"><div class="themeAdmin canvas"><div class="panel"><div class="panelBody">${plain(container.innerHTML)}</div></div></div></body></html>`);
}

describe("Admin TV → Tayangan", () => {
  it("shows every tayangan as one row: a picture of the slide, its name, one line of facts, its state", () => {
    const { container } = show();
    const rows = within(screen.getByRole("list", { name: "Tayangan, urut tayang" })).getAllByRole("listitem");
    expect(rows).toHaveLength(6);
    expect(rows[0].textContent).toContain("Kalender hari ini");
    expect(rows[0].textContent).toContain("Dari WAM · 15 detik · Semua TV · Setiap hari");
    expect(rows[1].textContent).toContain("Disembunyikan");
    expect(rows[2].textContent).toContain("Hari ini: PT Contoh Dua Sejahtera");
    expect(rows[4].textContent).toContain("Sampai video selesai · Semua TV · Setiap hari · Tanpa suara");
    expect(rows[5].textContent).toContain("Lobi · 1 Des – 10 Des · 08.00–17.00");
    // Each row opens with a drawing of its slide; a typed one shows its own words in it.
    expect(rows.every(item => !!item.querySelector("svg[viewBox='0 0 160 90']"))).toBe(true);
    expect(rows[3].querySelector("svg[viewBox='0 0 160 90']")?.textContent).toContain("Contoh Satu");
    keep("daftar", container);
  });

  it("has one main action, and filters by state with the number of each", () => {
    show();
    expect(screen.getByRole("button", { name: "Tambah tayangan" })).toBeTruthy();
    const chips = within(screen.getByRole("group", { name: "Tampilkan" }));
    expect(chips.getByRole("button", { name: "Semua 6" })).toBeTruthy();
    expect(chips.getByRole("button", { name: "Tayang 5" })).toBeTruthy();
    fireEvent.click(chips.getByRole("button", { name: "Disembunyikan 1" }));
    const rows = within(screen.getByRole("list", { name: "Tayangan, urut tayang" })).getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Kalender minggu ini");
    // The order is changed where every row shows.
    expect(screen.queryByRole("button", { name: /^Naikkan / })).toBeNull();
  });

  it("keeps on a row only the arrows; the row itself opens the rest", () => {
    show();
    for (const name of ["Naikkan", "Turunkan", "Atur"]) expect(screen.getAllByRole("button", { name: new RegExp(`^${name} `) })).toHaveLength(6);
    expect((screen.getByRole("button", { name: "Naikkan Kalender hari ini" }) as HTMLButtonElement).disabled).toBe(true);
    for (const name of ["Simpan", "Hapus", "Sembunyikan", "Tayangkan sekarang"]) expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("opens a tayangan in a sheet with its words, when and where it plays, and the other actions", () => {
    const { container } = show();
    fireEvent.click(screen.getByRole("button", { name: "Atur Contoh Satu" }));
    const sheet = within(screen.getByRole("dialog", { name: "Contoh Satu" }));
    expect((sheet.getByLabelText("Nama tamu") as HTMLInputElement).value).toBe("Contoh Satu");
    expect((sheet.getByLabelText("Lama tayang") as HTMLSelectElement).value).toBe("15");
    // A typed welcome picks its design; it has no visit, so no cover photo to pick.
    const design = sheet.getByLabelText("Desain layar") as HTMLSelectElement;
    expect(design.value).toBe("werkudara");
    expect([...design.options].map(option => option.value)).toEqual(["werkudara", "polos"]);
    for (const name of ["Isi", "Kapan tayang", "Di TV mana"]) expect(sheet.getByRole("group", { name })).toBeTruthy();
    for (const name of ["Simpan", "Batal", "Hapus", "Sembunyikan", "Tayangkan sekarang"]) expect(sheet.getByRole("button", { name })).toBeTruthy();
    fireEvent.click(sheet.getByRole("button", { name: "Tayangkan sekarang" }));
    expect((sheet.getByLabelText("Lama") as HTMLSelectElement).value).toBe("15");
    expect(sheet.getByRole("button", { name: "Mulai tayangkan" })).toBeTruthy();
    keep("ubah", container);
    fireEvent.click(sheet.getByRole("button", { name: "Batal" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Atur Rapat bulanan/ }));
    expect((screen.getByLabelText("Judul") as HTMLInputElement).value).toContain("Rapat bulanan");
    expect((screen.getByLabelText("Lobi") as HTMLInputElement).checked).toBe(true);
  });

  it("offers Tayangkan lagi for a hidden tayangan, and no Tayangkan sekarang before its migration", () => {
    show(admin({ welcomeReady: false }));
    fireEvent.click(screen.getByRole("button", { name: "Atur Kalender minggu ini" }));
    expect(screen.getByRole("button", { name: "Tayangkan lagi" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tayangkan sekarang" })).toBeNull();
    expect(screen.getByText(/menunggu migrasi 202611100008/)).toBeTruthy();
  });

  it("lets a video play with its sound, and keeps a file's length for old TVs", () => {
    const data = admin();
    const video = { ...data.items!.find(item => item.kind === "video")!, videoFile: true, body: "pra-wam/tv/video/contoh.mp4", sound: false, length: 95 };
    const { container } = show({ ...data, soundReady: true, items: data.items!.map(item => (item.kind === "video" ? video : item)) });
    fireEvent.click(screen.getByRole("button", { name: "Atur Annual Meeting 2025" }));
    const sound = within(screen.getByRole("radiogroup", { name: "Suara video" }));
    expect((sound.getByRole("radio", { name: /Tanpa suara/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(sound.getByRole("radio", { name: /Dengan suara/ }));
    expect(screen.getByText(/tekan OK di remote sekali/)).toBeTruthy();
    const length = screen.getByLabelText("Lama video (detik)") as HTMLInputElement;
    expect(length.value).toBe("95");
    // A length no video has is refused before it is sent.
    fireEvent.change(length, { target: { value: "2" } });
    expect(screen.getByText(/antara 3 dan 1.800 detik/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Simpan" }) as HTMLButtonElement).disabled).toBe(true);
    keep("suara", container);
  });

  it("says that old TVs pass over a YouTube video", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Atur Annual Meeting 2025" }));
    expect(screen.getByText(/TV lama \(alamat \/lite\) melewati video YouTube/)).toBeTruthy();
    expect(screen.queryByLabelText("Lama video (detik)")).toBeNull();
  });

  it("adds through one sheet that first asks what to add, in plain words", () => {
    const { container } = show();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tambah tayangan" }));
    const pick = () => screen.getByRole("dialog");
    expect(within(pick()).getAllByRole("listitem")).toHaveLength(6);
    keep("tambah", container);
    const choose = (name: RegExp) => fireEvent.click(within(pick()).getByRole("button", { name }));
    const back = () => fireEvent.click(within(pick()).getByRole("button", { name: "Jenis lain" }));

    choose(/^Jadwal dan info otomatis/);
    expect(screen.getByRole("button", { name: "Tambah Timeline Pra WAM" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tambah Kalender hari ini" })).toBeNull();
    back();

    choose(/^Sambutan tamu/);
    const addGuest = screen.getByRole("button", { name: "Tambah sambutan" }) as HTMLButtonElement;
    expect(addGuest.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Nama tamu"), { target: { value: "Contoh Tiga" } });
    expect(pick().querySelector("svg[viewBox='0 0 160 90']")?.textContent).toContain("Contoh Tiga");
    expect(addGuest.disabled).toBe(false);
    back();

    choose(/^Ucapan ulang tahun/);
    const addBirthday = screen.getByRole("button", { name: "Tambah ucapan" }) as HTMLButtonElement;
    expect(addBirthday.disabled).toBe(true);
    // The photo is picked right here, before the greeting is added.
    expect(screen.getByRole("button", { name: "Pilih foto" })).toBeTruthy();
    expect((screen.getByLabelText("Ucapan") as HTMLTextAreaElement).value).toContain("May you always find happiness");
    expect((screen.getByLabelText("Tanggal ulang tahun") as HTMLInputElement).value).toBe("2026-11-10");
    fireEvent.change(screen.getByLabelText("Nama lengkap"), { target: { value: "Contoh Empat" } });
    fireEvent.change(screen.getByLabelText("Nama panggilan"), { target: { value: "Bu Contoh" } });
    expect(addBirthday.disabled).toBe(false);
    expect(pick().querySelector("svg[viewBox='0 0 160 90']")?.textContent).toContain("Happy Birthday Bu Contoh");
    back();

    choose(/^Video/);
    const addVideo = screen.getByRole("button", { name: "Tambah video" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Alamat video YouTube"), { target: { value: "https://example.com/video" } });
    expect(addVideo.disabled).toBe(true);
    expect(screen.getByText("Alamat ini bukan alamat video YouTube.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Alamat video YouTube"), { target: { value: "https://youtu.be/FWN1B1B7Gu8" } });
    expect(addVideo.disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Unggah berkas video" })).toBeTruthy();
    back();

    choose(/^Gambar/);
    expect(screen.getByRole("button", { name: "Unggah gambar" })).toBeTruthy();
    fireEvent.click(within(pick()).getByRole("button", { name: "Selesai" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("invites to add the first tayangan when the list is empty", () => {
    show(admin({ items: [] }));
    expect(screen.getByText(/Belum ada tayangan/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tambah tayangan pertama" }));
    expect(screen.getByRole("dialog", { name: "Tambah tayangan" })).toBeTruthy();
  });

  it("says at the top what takes the TVs over, with the way to stop it", () => {
    show(admin({ takeover: { itemId: "d", until: "2026-11-10T03:15:00Z", screenIds: [] } }));
    expect(screen.getByRole("status").textContent).toContain("Contoh Satu sedang mengambil alih semua TV, sampai 10.15 WIB");
    expect(screen.getByRole("button", { name: "Hentikan" })).toBeTruthy();
    expect(screen.getByText("Mengambil alih")).toBeTruthy();
  });
});

describe("a picture on a TV laid out in two rows", () => {
  const withPicture = (more: Partial<TvAdmin> = {}) => {
    const data = admin(more);
    return { ...data, items: [...data.items!, { ...data.items![0], id: "g", kind: "gambar" as const, title: "Rapat Contoh", slideId: "s1", strip: true }] };
  };

  it("says where the picture goes and lets its sheet move it, once TVs can be laid out so", () => {
    show(withPicture({ rowsReady: true }));
    expect(screen.getByText(/Baris foto bawah/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Atur Rapat Contoh" }));
    expect((screen.getByLabelText("Di TV dua baris") as HTMLSelectElement).value).toBe("bawah");
  });

  it("says nothing of it before that migration", () => {
    show(withPicture());
    expect(screen.queryByText(/Baris foto bawah/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Atur Rapat Contoh" }));
    expect(screen.queryByLabelText("Di TV dua baris")).toBeNull();
  });
});
