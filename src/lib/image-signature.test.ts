import { expect, it } from "vitest";
import { kindFromMime, sniffPhoto } from "./image-signature";

const bytes = (...parts: (number[] | string)[]) => new Uint8Array(parts.flatMap(part => typeof part === "string" ? [...part].map(c => c.charCodeAt(0)) : part));

it("recognises photos by their first bytes", () => {
  expect(sniffPhoto(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
  expect(sniffPhoto(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
  expect(sniffPhoto(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toBe("webp");
  expect(sniffPhoto(bytes([0, 0, 0, 24], "ftypheic"))).toBe("heic");
});

it("rejects anything else, whatever its name", () => {
  expect(sniffPhoto(bytes("<svg xmlns"))).toBeNull();
  expect(sniffPhoto(bytes("%PDF-1.7"))).toBeNull();
  expect(sniffPhoto(new Uint8Array())).toBeNull();
});

it("maps declared types", () => {
  expect(kindFromMime("image/JPEG")).toBe("jpeg");
  expect(kindFromMime("image/heif")).toBe("heic");
  expect(kindFromMime("image/svg+xml")).toBeNull();
});
