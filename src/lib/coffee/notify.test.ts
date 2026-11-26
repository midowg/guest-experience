import { expect, it } from "vitest";
import { claim, item, meeting, person } from "./fixtures";
import { COFFEE_PUSH_MIGRATION, pushCanTurnOn, pushFor, pushLabel, pushNote, testPush, type CoffeePushState } from "./notify";

const rina = person("e1", "Rina Putri", "karyawan", "RAHASIA-BU", "RAHASIA-JABATAN");
const by = { employeeId: "e9", label: "Dewi", at: "2026-11-25T03:00:00.000Z" };
const aClaim = claim("k1", 415, rina, "cafe-latte", { status: "ditolak", rejectNote: "RAHASIA-CATATAN", processed: by });
const aMeeting = meeting("m1", 112, rina, [item("a", "tamu", "kopi-susu", { qty: 3, guestName: "RAHASIA-NAMA-TAMU" }), item("b", "tim", "americano", { person: person("e3", "RAHASIA-TIM") })], { guest: "RAHASIA-TAMU", processed: by });

it("tells the pengelola about a new order and opens the queue", () => {
  expect(pushFor("klaim_baru", aClaim)).toEqual({ title: "Klaim baru", body: "Rina · Café Latte", url: "/admin/coffee", tag: "K-415" });
  expect(pushFor("rapat_baru", aMeeting)).toEqual({ title: "Pesanan rapat baru", body: "Kaliya Limasan · 4 minuman", url: "/admin/coffee", tag: "T-0112" });
});

it("tells whoever ordered about the decision, with who processed it, and opens their own screen", () => {
  expect(pushFor("selesai", aClaim)).toEqual({ title: "Silakan ambil di mesin", body: "Café Latte kamu selesai diproses oleh Dewi.", url: "/coffee/pesanan", tag: "K-415" });
  expect(pushFor("ditolak", aClaim)).toEqual({ title: "Pengajuan tidak bisa diproses", body: "Café Latte. Buka aplikasi untuk melihat catatan dari Dewi. Jatah kamu tidak berkurang.", url: "/coffee/pesanan", tag: "K-415" });
  // The GA officer who sent a meeting order lands on that order in Mode GA; the PIC, who may not have Mode GA, on the app.
  expect(pushFor("selesai", aMeeting)).toEqual({ title: "Pesanan rapat siap diambil", body: "Kaliya Limasan · 4 minuman. Selesai diproses oleh Dewi.", url: "/coffee/ga?pesanan=m1", tag: "T-0112" });
  expect(pushFor("selesai", aMeeting, "pic")).toMatchObject({ url: "/coffee", tag: "T-0112" });
  expect(pushFor("ditolak", aMeeting)).toMatchObject({ title: "Pesanan rapat tidak bisa diproses", body: "Kaliya Limasan. Buka Mode GA untuk melihat catatan dari Dewi.", url: "/coffee/ga?pesanan=m1" });
  expect(pushFor("ditolak", aMeeting, "pic").body).toBe("Kaliya Limasan. Buka aplikasi atau hubungi GA untuk melihat catatan dari Dewi.");
  // Nobody is named as processor yet (should not happen for a decision): a neutral word, never "HR".
  expect(pushFor("selesai", { ...aClaim, processed: null }).body).toBe("Café Latte kamu selesai diproses oleh pengelola.");
});

it("carries a first name, the drink and the room, and nothing else", () => {
  for (const event of ["klaim_baru", "rapat_baru", "selesai", "ditolak"] as const) {
    for (const order of [aClaim, aMeeting]) for (const reader of ["pengirim", "pic"] as const) {
      const text = JSON.stringify(pushFor(event, order, reader));
      expect(text).not.toMatch(/RAHASIA|Putri/);
      expect(text).not.toMatch(/\bHR\b|membelikan/i);
    }
  }
  expect(JSON.stringify(testPush())).not.toMatch(/RAHASIA/);
  expect(testPush()).toMatchObject({ title: "WG Coffee", url: "/coffee/pesanan" });
});

it("has words for every state of Nyalakan notifikasi, each saying what to do or that the app works anyway", () => {
  const states: CoffeePushState[] = ["checking", "off", "on", "denied", "ios-install", "unsupported", "not-ready", "account"];
  for (const state of states) for (const place of ["karyawan", "ga", "pengelola"] as const) {
    expect(pushNote(state, place).length, `${state} ${place}`).toBeGreaterThan(10);
    expect(pushLabel(state)).toBeTruthy();
  }
  expect(states.filter(pushCanTurnOn)).toEqual(["off"]);
  expect(pushNote("denied", "karyawan")).toMatch(/diblokir.*pengaturan situs.*Izinkan.*muat ulang.*Aplikasi tetap jalan/);
  expect(pushNote("ios-install", "karyawan")).toMatch(/dipasang dulu ke layar utama.*Tambah ke Layar Utama.*dibuka dari ikonnya/);
  expect(pushNote("unsupported", "ga")).toMatch(/belum mendukung notifikasi.*Tablet tetap jalan/);
  // Only the pengelola read what the server lacks; an employee reads that it is not there yet.
  expect(pushNote("not-ready", "pengelola", "kunci")).toMatch(/WAM_VAPID_PUBLIC_KEY dan WAM_VAPID_PRIVATE_KEY belum diisi/);
  expect(pushNote("not-ready", "pengelola", "migrasi")).toContain(COFFEE_PUSH_MIGRATION);
  expect(pushNote("not-ready", "karyawan", "kunci")).toBe("Notifikasi belum tersedia. Aplikasi tetap jalan: status pengajuan berubah sendiri di Pesanan saya.");
  expect(pushNote("account", "pengelola")).toMatch(/^Masuk dengan akun karyawan untuk menerima notifikasi\./);
});
