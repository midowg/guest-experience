import { describe, expect, it } from "vitest";
import { parseContactPhone } from "./contact-phone";

describe("PIC phone formats", () => {
  it.each(["0812 3456 7890", "62 812 3456 7890", "+62 812 3456 7890", "0812-3456-7890"])("maps %s to both contact channels", value => {
    expect(parseContactPhone(value)).toEqual({ local: "081234567890", international: "6281234567890" });
  });
  it.each(["", "123", "08123", "081234567890123", "628123", "+6281234567890123", "+1 812 3456 7890", "0812;alert(1)", "+62081234567890", "62081234567890"])("rejects invalid number %s", value => {
    expect(parseContactPhone(value)).toBeNull();
  });
});
