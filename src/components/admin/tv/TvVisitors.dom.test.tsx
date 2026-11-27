import { readFileSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TV_DEFAULT_SETTINGS } from "@/lib/pra-wam/tv";
import type { TvVisit } from "@/lib/pra-wam/tv-visits";
import type { TvAdmin } from "@/lib/server/pra-wam/tv";
import { PraWamTv } from "@/components/admin/wam/PraWamTv";
import { TvMonitor } from "./TvMonitor";

afterEach(cleanup);

const NOW = "2026-11-10T03:00:00Z"; // 10.00 WIB
const visit = (id: string, more: Partial<TvVisit>): TvVisit => ({
  id, device: `${id}`.padEnd(16, "0"), net: "aaaaaaaa", address: "/tv", version: "papan", kind: "tv", name: "TV Samsung · Samsung Internet 2",
  width: 1920, height: 1080, firstSeenAt: "2026-11-10T01:00:00Z", lastSeenAt: "2026-11-10T02:59:30Z", day: "2026-11-10", ...more,
});
const visits: TvVisit[] = [
  visit("a", {}),
  visit("b", { address: "/tv/lite", version: "lite", name: "TV LG · Chrome 53", width: null, height: null, lastSeenAt: "2026-11-10T02:59:50Z" }),
  visit("c", { kind: "hp", version: "hp", name: "HP Android · Chrome 131", width: 390, height: 844, lastSeenAt: "2026-11-10T02:10:00Z" }),
  visit("d", { kind: "komputer", name: "Komputer Windows · Edge 131", net: "bbbbbbbb", width: 1536, height: 864, lastSeenAt: "2026-11-10T02:40:00Z" }),
  visit("e", { day: "2026-11-09", firstSeenAt: "2026-11-09T02:00:00Z", lastSeenAt: "2026-11-09T09:00:00Z", name: "TV Samsung · Samsung Internet 2", device: "a000000000000000" }),
];
const admin = (more: Partial<TvAdmin> = {}): TvAdmin => ({
  migrated: true, slugReady: true, lookReady: true, storageReady: true, now: NOW, slides: [], settings: TV_DEFAULT_SETTINGS,
  screens: [{ id: "lobi", name: "Lobi", slug: "lobi", keyHint: "", lastSeenAt: "2026-11-10T02:59:55Z", width: 1920, height: 1080, createdAt: "2026-11-10T00:00:00Z", lastItem: "Kalender hari ini", playsVideo: true }],
  items: [], welcomeReady: true, takeover: null, welcomes: [], videoReady: true, visits, visitsReady: true, ...more,
});

/** With TV_PLAYLIST_HTML set to a folder, the page is also written there as plain HTML with the real stylesheets, to look at in a browser. */
function keep(name: string, container: HTMLElement) {
  const folder = process.env.TV_PLAYLIST_HTML;
  if (!folder) return;
  const sheets = ["src/app/globals.css", "src/components/console/console.module.css", "src/components/admin/wam/akun/akun.module.css", "src/components/admin/wam/tv-admin.module.css"]
    .map(path => readFileSync(path, "utf8")).join("\n");
  const html = container.innerHTML.replace(/_([A-Za-z][A-Za-z0-9]*)_[0-9a-f]{6}(?=[ "])/g, "$1");
  writeFileSync(`${folder}/${name}.html`, `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title><style>${sheets}</style></head>`
    + `<body style="margin:0"><div class="themeAdmin canvas"><div class="panel"><div class="panelBody">${html}</div></div></div></body></html>`);
}

describe("Admin TV → Pantauan, who opens the TV addresses", () => {
  const show = (data = admin()) => render(<TvMonitor initial={data} crumbs={["Admin TV", "Pantauan"]} title="Pantauan" origin="https://contoh.test" />);

  it("says how many devices came today and how many look now, in the first row of numbers", () => {
    const { container } = show();
    const numbers = within(screen.getByRole("list", { name: "Angka penting" }));
    expect(numbers.getByText("Pembuka hari ini").closest("a")?.textContent).toContain("42 TV · 1 HP · 1 Komputer");
    // The TV on /tv and the one on /tv/lite asked within two minutes.
    expect(numbers.getByText("Sedang membuka").closest("a")?.textContent).toContain("21 memakai papan lite hari ini");
    keep("pantauan", container);
  });

  it("lists each device in plain words: what it is, the address and version it opened, its screen, and when", () => {
    show();
    const rows = within(screen.getByRole("list", { name: "Perangkat yang membuka alamat TV" })).getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    expect(rows[0].textContent).toContain("TV Samsung · Samsung Internet 2");
    expect(rows[0].textContent).toContain("Membuka /tv · Papan biasa · layar 1920×1080");
    expect(rows[0].textContent).toContain("sejak 08.00");
    expect(rows[0].textContent).toContain("Membuka");
    expect(rows[1].textContent).toContain("Membuka /tv/lite · Papan lite (TV lama)");
    // A phone on the network a TV is on is in the office; a computer on another network is not.
    expect(rows[2].textContent).toContain("Tampilan HP · layar 390×844 · satu jaringan dengan TV kantor");
    expect(rows[2].textContent).toContain("Sudah tutup");
    expect(rows[3].textContent).toContain("jaringan lain");
  });

  it("shows the week as one bar a day, and the other days on request", () => {
    show();
    expect(screen.getByRole("img", { name: /Perangkat per hari, 7 hari terakhir: .*Senin, 9 November 1, Selasa, 10 November 4/ })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("group", { name: "Rentang waktu" })).getByRole("button", { name: "7 hari terakhir 5" }));
    const rows = within(screen.getByRole("list", { name: "Perangkat yang membuka alamat TV" })).getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rows[4].textContent).toContain("Senin, 9 November, 09.00–16.00");
    expect(rows[4].textContent).toContain("Hari lain");
  });

  it("says that it waits for its migration before that has run, and shows no numbers of it", () => {
    show(admin({ visits: [], visitsReady: false }));
    expect(screen.getByText(/menunggu migrasi 202612030002_pw_tv_visits.sql/)).toBeTruthy();
    expect(screen.queryByText("Pembuka hari ini")).toBeNull();
  });

  it("invites nothing and blames nothing when nobody came today", () => {
    show(admin({ visits: [] }));
    expect(screen.getByText("Belum ada yang membuka alamat TV hari ini.")).toBeTruthy();
  });
});

describe("Admin TV → Layar TV, the two addresses", () => {
  it("gives every TV, and the address for all, its lite address too, and says what each version plays", () => {
    const { container } = render(<PraWamTv initial={admin()} crumbs={["Admin TV", "Layar TV"]} title="Layar TV" origin="https://contoh.test" view="layar" standalone />);
    // What the two versions play folds away under one line, so the addresses come first on a phone.
    const versions = within(screen.getByRole("group", { name: "Dua versi papan" }));
    expect(versions.getByText("Apa beda papan biasa dan papan lite?")).toBeTruthy();
    expect(versions.getByText(/Tidak menayangkan video YouTube/)).toBeTruthy();
    for (const address of ["https://contoh.test/tv", "https://contoh.test/tv/lite", "https://contoh.test/tv/lobi", "https://contoh.test/tv/lobi/lite"]) expect(screen.getByText(address)).toBeTruthy();
    for (const name of ["Salin alamat papan biasa untuk semua TV", "Salin alamat lite untuk semua TV", "Salin alamat papan biasa Lobi", "Salin alamat lite Lobi"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    keep("layar", container);
  });
});
