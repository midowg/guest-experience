import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { FRIDAY_SHARING_PATH, WELCOME_PATH, absolute, kuisScreenApi, kuisScreenPath, thanksPath, adminApi, adminEventPath, calendarPath, eventPath, galleryPath, guestApi, invitationPath, mainWamAdminApi, mainWamAdminPath, mainWamApi, mainWamPath, photoDownloadPath, posterPath, praWamPath, ticketPath } from "./routes";

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
  it("live under /wam2026, with filters in the query", () => {
    expect(mainWamPath.home).toBe("/wam2026");
    expect(mainWamPath.login("/wam2026/absen/t1")).toBe("/wam2026/masuk?next=%2Fwam2026%2Fabsen%2Ft1");
    expect(mainWamPath.agenda()).toBe("/wam2026/agenda");
    expect(mainWamPath.agenda(2)).toBe("/wam2026/agenda?hari=2");
    expect(mainWamPath.session("a b")).toBe("/wam2026/agenda/a%20b");
    expect(mainWamPath.travel()).toBe("/wam2026/saya/perjalanan");
    expect(mainWamPath.travel("pulang")).toBe("/wam2026/saya/perjalanan?arah=pulang");
    expect(mainWamPath.moments()).toBe("/wam2026/momen");
    expect(mainWamPath.moments({ sesi: "s1", foto: "p1" })).toBe("/wam2026/momen?sesi=s1&foto=p1");
    expect(mainWamPath.camera({ sesi: "umum" })).toBe("/wam2026/momen/kamera?sesi=umum");
    expect(mainWamPath.mosaic(true)).toBe("/wam2026/momen/mozaik?tandai=1");
    expect(mainWamPath.committee).toBe("/wam2026/kelola");
    expect(mainWamPath.moderation()).toBe("/wam2026/kelola/moderasi");
    expect(mainWamPath.moderation("disembunyikan")).toBe("/wam2026/kelola/moderasi?lihat=disembunyikan");
    expect(mainWamPath.checkIn("tok_1")).toBe("/wam2026/absen/tok_1");
    expect(mainWamPath.silentMeeting("s1")).toBe("/wam2026/silent-meeting?sesi=s1");
  });

  it("keep every page address unique", () => {
    const pages = Object.values(mainWamPath).map(value => typeof value === "function" ? (value as (arg?: never) => string)() : value);
    expect(new Set(pages).size).toBe(pages.length);
    for (const page of pages) expect(page.startsWith("/wam2026")).toBe(true);
  });

  it("put the APIs under /api/wam/acara and Admin WAM 2026's under /api/admin/wam2026 (20 Nov 2026: its own door)", () => {
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
      expect(path.startsWith("/api/admin/wam2026/")).toBe(true);
    }
    for (const value of Object.values(mainWamAdminPath)) {
      const path = typeof value === "function" ? (value as (arg: string) => string)("x") : value;
      expect(path === "/admin/wam2026" || path.startsWith("/admin/wam2026/")).toBe(true);
    }
    expect(mainWamAdminPath.committee).toBe("/admin/wam2026/panitia");
    expect(mainWamAdminApi.committeeMember("e1")).toBe("/api/admin/wam2026/panitia/e1");
  });

  it("give Kuis live its game, control, admin and a public big screen outside /wam", () => {
    expect(mainWamPath.quiz("k1")).toBe("/wam2026/kuis/k1");
    expect(mainWamPath.quizControl("k1")).toBe("/wam2026/kuis/k1/kendali");
    expect(mainWamApi.quiz("k1", "r.3.1")).toBe("/api/wam/acara/kuis/k1?v=r.3.1");
    expect(mainWamApi.quizAnswer("k1")).toBe("/api/wam/acara/kuis/k1/jawab");
    expect(mainWamAdminPath.quiz("k1")).toBe("/admin/wam2026/kuis/k1");
    expect(mainWamAdminApi.quizResults("k1", "r1", true)).toBe("/api/admin/wam2026/kuis/k1/hasil?permainan=r1&unduh=1");
    expect(kuisScreenPath("kuis_abc")).toBe("/kuis/kuis_abc");
    expect(kuisScreenApi("kuis_abc")).toBe("/api/kuis/kuis_abc");
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
