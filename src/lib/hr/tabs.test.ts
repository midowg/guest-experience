import { describe, expect, it } from "vitest";
import { hrTabPaths, tabOf } from "./tabs";

describe("WG People's bottom menu", () => {
  it("reads the place from the address", () => {
    expect(tabOf("/people")).toBe("beranda");
    expect(tabOf("/people/riwayat")).toBe("riwayat");
    expect(tabOf("/people/pengajuan?x=1")).toBe("pengajuan");
    expect(tabOf("/people/profil/")).toBe("profil");
    expect(tabOf("/people/tim")).toBe("tim");
  });
  it("shows Beranda for anything else", () => {
    expect(tabOf(null)).toBe("beranda");
    expect(tabOf("/people/masuk")).toBe("beranda");
    expect(tabOf("/dev-preview/absen")).toBe("beranda");
    expect(tabOf("/peoplex/riwayat")).toBe("beranda");
    expect(tabOf("/hr/riwayat")).toBe("beranda"); // the old address only redirects
  });
  it("gives each place its own address", () => {
    expect(Object.values(hrTabPaths)).toEqual(["/people", "/people/riwayat", "/people/tim", "/people/pengajuan", "/people/profil"]);
  });
});
