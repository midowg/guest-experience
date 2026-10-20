import { describe, expect, it } from "vitest";
import { localPhone, parseGuestList } from "./guest-import";

describe("parseGuestList", () => {
  it("reads rows pasted from a spreadsheet, with a header in any order", () => {
    const rows = parseGuestList("Nomor WA\tNama\tPendamping\n0812-3456-7890\tBu Sari\t2\n+62 813 1111 2222\tPak Budi\t\n");
    expect(rows).toEqual([
      { line: 2, name: "Bu Sari", phone: "6281234567890", party_size_max: 3, errors: [], duplicate: null },
      { line: 3, name: "Pak Budi", phone: "6281311112222", party_size_max: 1, errors: [], duplicate: null },
    ]);
  });

  it("reads CSV without a header as name, WhatsApp, companions, including quoted commas", () => {
    const rows = parseGuestList('"Sari, S.E.",081234567890,1\nBudi,,0\n');
    expect(rows.map(row => [row.name, row.phone, row.party_size_max])).toEqual([["Sari, S.E.", "6281234567890", 2], ["Budi", null, 1]]);
  });

  it("accepts semicolon CSV from Excel in Indonesian locale", () => {
    expect(parseGuestList("Nama;WA\nSari;081234567890")[0]).toMatchObject({ name: "Sari", phone: "6281234567890" });
  });

  it("explains bad rows instead of dropping them", () => {
    const [noName, badPhone, badCompanions] = parseGuestList("Nama,WA,Pendamping\n,081234567890,\nSari,12345,\nBudi,,15");
    expect(noName.errors).toEqual(["Nama kosong."]);
    expect(badPhone.errors[0]).toMatch(/^Nomor WA bukan nomor HP Indonesia/);
    expect(badCompanions.errors).toEqual(["Pendamping harus angka 0–9."]);
  });

  it("flags duplicates within the paste and against the existing list", () => {
    const rows = parseGuestList("Sari,081234567890\nSari Dewi,0812 3456 7890\nBudi\nbudi\nTono,081300000000", [{ name: "Tono Lama", phone: "6281300000000" }]);
    expect(rows.map(row => row.duplicate)).toEqual([null, "Nomor sama dengan baris 1.", null, "Nama sama dengan baris 3.", "Nomor sama dengan Tono Lama di daftar."]);
  });
});

it("formats numbers for display", () => {
  expect(localPhone("6281234567890")).toBe("0812 3456 7890");
  expect(localPhone(null)).toBe("");
});
