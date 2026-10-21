import { expect, it } from "vitest";
import { codeFromScan, isTicketCode, newTicketCode, ticketScanUrl } from "./tickets";

it("makes random 22-character codes", () => {
  const codes = new Set(Array.from({ length: 200 }, newTicketCode));
  expect(codes.size).toBe(200);
  for (const code of codes) expect(isTicketCode(code)).toBe(true);
  expect([...codes][0]).toHaveLength(22);
});

it("reads the code from the scanned address or the bare code", () => {
  const code = "AbCdEfGhIjKlMnOpQrStUv";
  expect(codeFromScan(ticketScanUrl("https://invitation.example", code))).toBe(code);
  expect(codeFromScan(` ${code} `)).toBe(code);
  expect(codeFromScan("https://evil.example/?q=1")).toBeNull();
  expect(codeFromScan("https://invitation.example/admin/checkin/short")).toBeNull();
});
