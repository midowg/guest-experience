import { expect, it } from "vitest";
import { claim, item, meeting, person } from "./fixtures";
import { pushFor } from "./notify";

const rina = person("e1", "Rina Putri", "karyawan", "RAHASIA-BU", "RAHASIA-JABATAN");
const aClaim = claim("k1", 415, rina, "cafe-latte", { status: "ditolak", rejectNote: "RAHASIA-CATATAN" });
const aMeeting = meeting("m1", 112, rina, [item("a", "tamu", "kopi-susu", { qty: 3 }), item("b", "tim", "americano", { person: person("e3", "RAHASIA-TIM") })], { guest: "RAHASIA-TAMU" });

it("tells the pengelola about a new order and opens the queue", () => {
  expect(pushFor("klaim_baru", aClaim)).toEqual({ title: "Klaim baru", body: "Rina · Café Latte", url: "/admin/coffee", tag: "K-415" });
  expect(pushFor("rapat_baru", aMeeting)).toEqual({ title: "Pesanan rapat baru", body: "Kaliya Limasan · 4 minuman", url: "/admin/coffee", tag: "T-0112" });
});

it("tells whoever ordered about the decision and opens their own screen", () => {
  expect(pushFor("selesai", aClaim)).toMatchObject({ title: "Silakan ambil di mesin", url: "/coffee/pesanan", tag: "K-415" });
  expect(pushFor("ditolak", aClaim)).toMatchObject({ title: "Pengajuan tidak bisa diproses", url: "/coffee/pesanan" });
  expect(pushFor("selesai", aMeeting)).toMatchObject({ url: "/coffee/ga", tag: "T-0112" });
  expect(pushFor("ditolak", aMeeting)).toMatchObject({ title: "Pesanan rapat tidak bisa diproses", url: "/coffee/ga" });
});

it("carries a first name, the drink and the room, and nothing else", () => {
  for (const event of ["klaim_baru", "rapat_baru", "selesai", "ditolak"] as const) {
    for (const order of [aClaim, aMeeting]) expect(JSON.stringify(pushFor(event, order))).not.toMatch(/RAHASIA|Putri/);
  }
});
