import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { absolute, adminApi, adminEventPath, calendarPath, eventPath, galleryPath, guestApi, invitationPath, photoDownloadPath, posterPath, ticketPath } from "./routes";

const legacy = { id: "e1", slug: "kunjungan-sinar" };
const short = { ...legacy, code: "AB23CD" };
const invitation = { token: "a".repeat(64), short_token: "k7q2mx9p" };

describe("guest addresses", () => {
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

it("builds addresses only in routes.ts", () => {
  const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const offenders = sources(root)
    .filter(path => !path.endsWith(join("lib", "routes.ts")))
    .filter(path => /[`"]\/(?:e\/|admin\/events\/|api\/admin\/events|api\/events\/|admin\/checkin\/)/.test(readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")))
    .map(path => relative(root, path));
  expect(offenders).toEqual([]);
});
