import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { FRIDAY_SHARING_PATH, WELCOME_PATH, absolute, thanksPath, adminApi, adminEventPath, calendarPath, eventPath, galleryPath, guestApi, invitationPath, mainWamAdminApi, mainWamAdminPath, mainWamApi, mainWamPath, photoDownloadPath, posterPath, praWamPath, ticketPath } from "./routes";

const legacy = { id: "e1", slug: "kunjungan-sinar" };
const short = { ...legacy, code: "AB23CD" };
const invitation = { token: "a".repeat(64), short_token: "k7q2mx9p" };

describe("guest addresses", () => {
  it("give Friday Sharing addresses without a code, public and admin", () => {
    expect(FRIDAY_SHARING_PATH).toBe("/friday-sharing");
    expect(eventPath({ ...short, event_kind: "csr" })).toBe("/friday-sharing");
    expect(adminEventPath({ ...short, event_kind: "csr" })).toBe("/admin/friday-sharing");
    expect(adminEventPath({ ...short, event_kind: "csr" }, "donations-report", { penerima: "p1" })).toBe("/admin/friday-sharing/donasi/laporan?penerima=p1");
    expect(adminEventPath({ ...short, event_kind: "kunjungan" })).toBe("/admin/acara/AB23CD");
  });

  it("name a Welcome visit by its guest: /welcome/{slug}, and a personal link under it", () => {
    const visit = { ...short, slug: "vortex", event_kind: "kunjungan" };
    expect(WELCOME_PATH).toBe("/welcome");
    expect(eventPath(visit)).toBe("/welcome/vortex");
    expect(invitationPath(visit, invitation)).toBe("/welcome/vortex/k7q2mx9p");
    expect(thanksPath(visit)).toBe("/welcome/vortex/terima-kasih");
    expect(thanksPath(visit, invitation)).toBe("/welcome/vortex/k7q2mx9p/terima-kasih");
    expect(galleryPath(visit)).toBe("/welcome/vortex/galeri");
    expect(calendarPath(visit)).toBe("/welcome/vortex/kalender.ics");
    // Without a short token the personal link keeps the long form.
    expect(invitationPath(visit, { token: invitation.token })).toBe(`/e/vortex/i/${invitation.token}`);
  });

  it("use the short code when the event has one", () => {
    expect(eventPath(short)).toBe("/AB23CD");
    expect(invitationPath(short, invitation)).toBe("/AB23CD/k7q2mx9p");
    expect(ticketPath(short, invitation)).toBe("/AB23CD/k7q2mx9p/tiket");
    expect(galleryPath(short)).toBe("/AB23CD/galeri");
    expect(posterPath(short)).toBe("/AB23CD/poster");
    expect(photoDownloadPath(short, "p1")).toBe("/AB23CD/galeri/p1/unduh");
    expect(calendarPath(short, { ingat: "30" })).toBe("/AB23CD/kalender.ics?ingat=30");
  });

  it("fall back to the slug form before the short-link migration", () => {
    expect(eventPath(legacy)).toBe("/e/kunjungan-sinar");
    expect(invitationPath(short, { token: invitation.token })).toBe(`/e/kunjungan-sinar/i/${invitation.token}`);
    expect(calendarPath(legacy)).toBe("/e/kunjungan-sinar/kalender.ics");
    expect(posterPath(legacy)).toBe("/e/kunjungan-sinar/poster");
    expect(absolute("https://invitation.example/", "/AB23CD")).toBe("https://invitation.example/AB23CD");
  });

  it("keep the guest APIs on slug and long token", () => {
    expect(guestApi.rsvp(short)).toBe("/api/events/kunjungan-sinar/rsvp");
    expect(guestApi.rsvp(short, invitation)).toBe(`/api/events/kunjungan-sinar/i/${invitation.token}/rsvp`);
    expect(guestApi.feedback(short)).toBe("/api/events/kunjungan-sinar/feedback");
  });
});

describe("admin addresses", () => {
  it("name every event page and API", () => {
    expect(adminEventPath(legacy)).toBe("/admin/acara/e1");
    expect(adminEventPath(short, "invitations")).toBe("/admin/acara/AB23CD/undangan");
    expect(adminEventPath("e1", "beo-print", { versi: "internal" })).toBe("/admin/acara/e1/beo/cetak?versi=internal");
    expect(adminApi("e1", "gallery")).toBe("/api/admin/events/e1/gallery");
    expect(adminApi("e1")).toBe("/api/admin/events/e1");
  });
});

/** Source files outside routes.ts must not write addresses by hand; tests and docs are exempt. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "dev-preview" ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("WAM addresses", () => {
  it("open Book on a day, and on one booking for an agenda item", () => {
    expect(praWamPath.appraisal()).toBe("/wam/book");
    expect(praWamPath.appraisal("2026-11-05")).toBe("/wam/book?date=2026-11-05");
    expect(praWamPath.appraisal("2026-11-05", "b-1")).toBe("/wam/book?date=2026-11-05&booking=b-1");
    expect(praWamPath.appraisal(undefined, "b 1")).toBe("/wam/book?booking=b+1");
  });
});

describe("Main WAM addresses (docs/main-wam/KONTRAK.md §5)", () => {
  it("live under /wam/acara, with filters in the query", () => {
    expect(mainWamPath.home).toBe("/wam/acara");
    expect(mainWamPath.login("/wam/acara/absen/t1")).toBe("/wam/acara/masuk?next=%2Fwam%2Facara%2Fabsen%2Ft1");
    expect(mainWamPath.agenda()).toBe("/wam/acara/agenda");
    expect(mainWamPath.agenda(2)).toBe("/wam/acara/agenda?hari=2");
    expect(mainWamPath.session("a b")).toBe("/wam/acara/agenda/a%20b");
    expect(mainWamPath.travel()).toBe("/wam/acara/saya/perjalanan");
    expect(mainWamPath.travel("pulang")).toBe("/wam/acara/saya/perjalanan?arah=pulang");
    expect(mainWamPath.moments()).toBe("/wam/acara/momen");
    expect(mainWamPath.moments({ sesi: "s1", foto: "p1" })).toBe("/wam/acara/momen?sesi=s1&foto=p1");
    expect(mainWamPath.camera({ sesi: "umum" })).toBe("/wam/acara/momen/kamera?sesi=umum");
    expect(mainWamPath.gallery({ lihat: "saya" })).toBe("/wam/acara/momen/galeri?lihat=saya");
    expect(mainWamPath.mosaic(true)).toBe("/wam/acara/momen/mozaik?tandai=1");
    expect(mainWamPath.committee).toBe("/wam/acara/kelola");
    expect(mainWamPath.moderation()).toBe("/wam/acara/kelola/moderasi");
    expect(mainWamPath.moderation("disembunyikan")).toBe("/wam/acara/kelola/moderasi?lihat=disembunyikan");
    expect(mainWamPath.checkIn("tok_1")).toBe("/wam/acara/absen/tok_1");
    expect(mainWamPath.silentMeeting("s1")).toBe("/wam/acara/silent-meeting?sesi=s1");
  });

  it("keep every page address unique", () => {
    const pages = Object.values(mainWamPath).map(value => typeof value === "function" ? (value as (arg?: never) => string)() : value);
    expect(new Set(pages).size).toBe(pages.length);
    for (const page of pages) expect(page.startsWith("/wam/acara")).toBe(true);
  });

  it("put the APIs under /api/wam/acara and Admin WAM's under /api/admin/wam/main", () => {
    expect(mainWamApi.themeImage("splash", "17")).toBe("/api/wam/acara/tema/splash?v=17");
    expect(mainWamApi.photos({ lihat: "saya", sebelum: "x" })).toBe("/api/wam/acara/momen?lihat=saya&sebelum=x");
    expect(mainWamApi.photoReaction("p1")).toBe("/api/wam/acara/momen/p1/reaksi");
    expect(mainWamApi.photoFile("p1", "kecil")).toBe("/api/wam/acara/momen/p1/berkas?ukuran=kecil");
    expect(mainWamApi.vote("c1")).toBe("/api/wam/acara/awarding/c1/suara");
    for (const value of Object.values(mainWamApi)) {
      const path = typeof value === "function" ? (value as (arg: string) => string)("x") : value;
      expect(path.startsWith("/api/wam/acara/")).toBe(true);
    }
    for (const value of Object.values(mainWamAdminApi)) {
      const path = typeof value === "function" ? (value as (arg: string) => string)("x") : value;
      expect(path.startsWith("/api/admin/wam/main/")).toBe(true);
    }
    for (const value of Object.values(mainWamAdminPath)) expect(value.startsWith("/admin/wam/main/")).toBe(true);
  });

  it("keep Pra WAM's Beranda reachable while Main WAM is on", () => {
    expect(praWamPath.homePra).toBe("/wam?versi=pra");
    expect(praWamPath.home).toBe("/wam");
  });
});

it("builds addresses only in routes.ts", () => {
  const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const offenders = sources(root)
    .filter(path => !path.endsWith(join("lib", "routes.ts")))
    .filter(path => /[`"]\/(?:e\/|admin\/events\/|api\/admin\/events|api\/events\/|admin\/checkin\/)/.test(readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")))
    .map(path => relative(root, path));
  expect(offenders).toEqual([]);
});
