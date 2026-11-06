import { describe, expect, it } from "vitest";
import { wamScreen } from "./screen";

const q = (search = "") => new URLSearchParams(search);
const me = { id: "e1", bod: false };

describe("wamScreen: what the frame shows, from the address alone", () => {
  it("lights the tab of each main screen, with no back arrow", () => {
    expect(wamScreen("/wam", q(), me)).toEqual({ current: "beranda" });
    expect(wamScreen("/wam/book", q("date=2026-11-06"), me)).toEqual({ current: "appraisal" });
    expect(wamScreen("/wam/documents/", q(), me)).toEqual({ current: "dokumen" });
    expect(wamScreen("/wam/manage/requests", q(), me)).toEqual({ current: "permintaan" });
    expect(wamScreen("/wam/hod", q(), me)).toEqual({ current: "appraisal" });
  });

  it("gives a pushed screen its back arrow and title, as the pages did", () => {
    expect(wamScreen("/wam/settings", q(), me)).toEqual({ current: "akun", back: { href: "/wam/account", title: "Pengaturan" } });
    expect(wamScreen("/wam/about", q("dari=pengaturan"), me).back).toEqual({ href: "/wam/settings", title: "Tentang WAM" });
    expect(wamScreen("/wam/about", q(), me).back?.href).toBe("/wam");
    expect(wamScreen("/wam/book/new", q("date=2026-11-06&edit=b1"), me)).toEqual({ current: "appraisal", back: { href: "/wam/book?date=2026-11-06", title: "Ubah booking" } });
    expect(wamScreen("/wam/book/new", q(), me).back?.title).toBe("Book ruang");
    expect(wamScreen("/wam/manage/sessions/new", q(), me).back?.title).toBe("Buat sesi");
    expect(wamScreen("/wam/manage/sessions/s1", q(), me).back?.title).toBe("Ubah sesi");
    expect(wamScreen("/wam/manage/sessions/s1/attendance", q(), me).back?.title).toBe("QR dan daftar hadir");
    expect(wamScreen("/wam/check-in/abc", q(), me)).toEqual({ current: "agenda", back: { href: "/wam/agenda", title: "Absen sesi" } });
  });

  it("sends the back arrow after a new password only to a WAM page", () => {
    expect(wamScreen("/wam/new-password", q("next=/wam/book"), me).back?.href).toBe("/wam/book");
    expect(wamScreen("/wam/new-password", q("next=https://evil.example"), me).back?.href).toBe("/wam");
  });

  it("knows the person's own card, and a BOD reading a participant", () => {
    expect(wamScreen("/wam/rekan/e1", q(), me).back?.title).toBe("Kartumu");
    expect(wamScreen("/wam/rekan/e2", q(), me).back?.title).toBe("Profil rekan");
    expect(wamScreen("/wam/manage/people/e2", q(), { id: "e1", bod: true }).current).toBeUndefined();
    expect(wamScreen("/wam/manage/people/e2", q(), me).current).toBe("peserta");
  });

  it("keeps a session's detail in Kelola acara only when opened from there", () => {
    expect(wamScreen("/wam/sessions/s1", q(), me)).toEqual({ current: "agenda", back: { href: "/wam/agenda", title: "Detail sesi" } });
    expect(wamScreen("/wam/sessions/s1", q(), me, true)).toEqual({ current: "sesi", back: { href: "/wam/manage/sessions", title: "Detail sesi" } });
  });
});
