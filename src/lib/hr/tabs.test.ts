import { describe, expect, it } from "vitest";
import { hrTabPaths, tabOf } from "./tabs";

describe("WG People's bottom menu", () => {
  it("reads the place from the address", () => {
    expect(tabOf("/hr")).toBe("beranda");
    expect(tabOf("/hr/riwayat")).toBe("riwayat");
    expect(tabOf("/hr/pengajuan?x=1")).toBe("pengajuan");
    expect(tabOf("/hr/profil/")).toBe("profil");
    expect(tabOf("/hr/tim")).toBe("tim");
  });
  it("shows Beranda for anything else", () => {
    expect(tabOf(null)).toBe("beranda");
    expect(tabOf("/hr/masuk")).toBe("beranda");
    expect(tabOf("/dev-preview/absen")).toBe("beranda");
    expect(tabOf("/hrx/riwayat")).toBe("beranda");
  });
  it("gives each place its own address", () => {
    expect(Object.values(hrTabPaths)).toEqual(["/hr", "/hr/riwayat", "/hr/tim", "/hr/pengajuan", "/hr/profil"]);
  });
});
