import { expect, it } from "vitest";
import { claimText, meetingText, orderText } from "./copy-text";
import { claim, item, meeting, person } from "./fixtures";

const rina = person("e1", "Contoh Rina Putri");
const dimas = person("e2", "Dimas Pratama");

it("writes a claim as two lines for JumpStart", () => {
  const order = claim("k1", 415, { ...rina, name: "Rina Putri" }, "cafe-latte", { items: [item("a", "klaim", "cafe-latte", { temperature: "es", sugar: "Sedikit" })] });
  expect(claimText(order)).toBe("Klaim K-415 · Rina (Karyawan)\n1× Café Latte · Es · gula Sedikit · es Normal");
  expect(orderText(order)).toBe(claimText(order));
});

it("writes a meeting order with guests, team and the total", () => {
  const order = meeting("m1", 112, dimas, [
    item("a", "tamu", "kopi-susu", { qty: 3 }), item("b", "tamu", "cappuccino", { qty: 2, sugar: "Sedikit" }),
    item("d", "tamu", "classic-tea", { guestName: "Budi" }),
    item("c", "tim", "americano", { sugar: "Tanpa", person: person("e3", "Andi Wijaya") }),
  ]);
  expect(meetingText(order)).toBe([
    "Rapat T-0112 · Kaliya Limasan · PIC Dimas Pratama",
    "Tamu Contoh PT Sinar (5 orang):",
    "- 3× Kopi Susu · Panas · gula Normal",
    "- 2× Cappuccino · Panas · gula Sedikit",
    "- 1× Classic Tea · Panas · gula Normal (Tamu · Budi)",
    "Tim · rapat:",
    "- 1× Americano · Panas · gula Tanpa (Andi Wijaya)",
    "Total 7 minuman",
  ].join("\n"));
  expect(orderText(order)).toBe(meetingText(order));
});

it("marks a later round, and leaves out what is not there", () => {
  const order = meeting("m2", 112, dimas, [item("a", "tamu", "lainnya", { other: "Teh tarik" })], { round: 2, guest: "", guestCount: null, room: "" });
  expect(meetingText(order)).toBe("Rapat T-0112 (tambahan ke-2) · Tanpa ruangan · PIC Dimas Pratama\nTamu:\n- 1× Teh tarik · Panas · gula Normal\nTotal 1 minuman");
});
