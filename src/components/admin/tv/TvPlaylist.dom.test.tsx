import { readFileSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TV_DEFAULT_SETTINGS } from "@/lib/pra-wam/tv";
import type { TvAdmin, TvAdminItem } from "@/lib/server/pra-wam/tv";
import { TvPlaylist } from "./TvPlaylist";

afterEach(cleanup);

const always = { showFrom: null, showUntil: null, timeFrom: null, timeUntil: null, screenIds: [] as string[] };
const row = (id: string, kind: TvAdminItem["kind"], more: Partial<TvAdminItem> = {}): TvAdminItem => ({ id, kind, title: "", body: "", seconds: 15, active: true, slideId: null, ...always, ...more });
const admin = (more: Partial<TvAdmin> = {}): TvAdmin => ({
  migrated: true, slugReady: true, lookReady: true, storageReady: true, now: "2026-11-10T03:00:00Z", slides: [], settings: TV_DEFAULT_SETTINGS,
  screens: [{ id: "lobi", name: "Lobi", slug: "lobi", keyHint: "", lastSeenAt: null, width: null, height: null, createdAt: "2026-11-10T00:00:00Z", lastItem: null }],
  items: [
    row("a", "kalender_hari"),
    row("b", "kalender_minggu", { active: false }),
    row("c", "sambutan"),
    row("d", "tamu", { title: "Contoh Satu", body: "Terima kasih sudah berkunjung ke kantor kami." }),
    row("e", "teks", { title: "Rapat bulanan pindah ke lantai dua mulai pekan depan", body: "Mohon perhatikan papan ruang.", showFrom: "2026-12-01", showUntil: "2026-12-10", timeFrom: "08:00", timeUntil: "17:00", screenIds: ["lobi"] }),
  ],
  welcomeReady: true, takeover: null, welcomes: ["PT Contoh Dua Sejahtera"], ...more,
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
  it("lists every row with its source and schedule, and marks the hidden one", () => {
    const { container } = show();
    const rows = within(screen.getByRole("list", { name: "Tayangan, urut tayang" })).getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rows[0].textContent).toContain("Kalender hari ini");
    expect(rows[0].textContent).toContain("Dari WAM · Selalu, di semua TV");
    expect(rows[1].textContent).toContain("Disembunyikan");
    expect(rows[2].textContent).toContain("Hari ini: PT Contoh Dua Sejahtera");
    expect(rows[4].textContent).toContain("1 Des – 10 Des · 08.00–17.00 · Lobi");
    expect(screen.getByText("4 tayang dari 5")).toBeTruthy();
    keep("daftar", container);
  });

  it("gives every row the same named tools, and no Sekarang before its migration", () => {
    show();
    for (const name of ["Naikkan", "Turunkan", "Durasi", "Tayangkan sekarang:", "Ubah", "Hapus"]) expect(screen.getAllByRole(name === "Durasi" ? "combobox" : "button", { name: new RegExp(`^${name} `) })).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Tayangkan Kalender minggu ini" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Naikkan Kalender hari ini" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    show(admin({ welcomeReady: false }));
    expect(screen.queryByRole("button", { name: /^Tayangkan sekarang:/ })).toBeNull();
    expect(screen.getByText(/menunggu migrasi 202611100008/)).toBeTruthy();
  });

  it("opens one form at a time inside the row: Ubah, or Tayangkan sekarang", () => {
    const { container } = show();
    fireEvent.click(screen.getByRole("button", { name: "Ubah Contoh Satu" }));
    expect((screen.getByLabelText("Nama tamu") as HTMLInputElement).value).toBe("Contoh Satu");
    expect(screen.getByLabelText("Ucapan")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Tayangkan sekarang: Contoh Satu/ }));
    expect(screen.queryByLabelText("Ucapan")).toBeNull();
    expect((screen.getByLabelText("Lama") as HTMLSelectElement).value).toBe("15");
    expect(screen.getByRole("button", { name: "Mulai tayangkan" })).toBeTruthy();
    keep("sekarang", container);
    fireEvent.click(screen.getByRole("button", { name: /^Ubah Rapat bulanan/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sambutan" }));
    keep("ubah", container);
  });

  it("adds through one card with a choice of four, the templates not yet in the list first", () => {
    show();
    expect(screen.getByRole("button", { name: "Tambah Timeline Pra WAM" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tambah Kalender hari ini" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sambutan" }));
    const addGuest = screen.getByRole("button", { name: "Tambah sambutan" }) as HTMLButtonElement;
    expect(addGuest.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Nama tamu"), { target: { value: "Contoh Tiga" } });
    expect(addGuest.disabled).toBe(false);
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
