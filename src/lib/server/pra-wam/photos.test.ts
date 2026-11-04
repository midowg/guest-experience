import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { photoKeyFor } from "@/lib/pra-wam/photo";
import { startPhotoUpload, tokenMatches } from "./photos";
import type { Member } from "./session";

const secret = "x".repeat(40);
const member: Member = { id: "11111111-2222-4333-8444-555555555555", name: "Bagus Werkudara", nickname: "Bagus", department: "IT", position: "Staf", mustChangePassword: false, roles: [], photo: null };
const key = photoKeyFor(member.id, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "image/webp");
const input = { mime: "image/webp" as const, size: 120_000 };
const sign = (expires: number) => `${expires}.${createHmac("sha256", secret).update(["foto", key, input.size, input.mime, member.id, expires].join("\0")).digest("hex")}`;

beforeEach(() => { vi.stubEnv("WAM_SESSION_SECRET", secret); });
afterEach(() => { vi.unstubAllEnvs(); });

it("refuses to start before storage is set up", async () => {
  vi.stubEnv("R2_ACCOUNT_ID", "");
  await expect(startPhotoUpload(input, member)).rejects.toMatchObject({ status: 503 });
});

it("checks the token against key, type, size, person and expiry", () => {
  const expires = Math.floor(Date.now() / 1000) + 600;
  const token = sign(expires);
  expect(tokenMatches(token, key, input, member)).toBe(true);
  expect(tokenMatches(token, key, { ...input, size: 120_001 }, member)).toBe(false);
  expect(tokenMatches(token, key, { ...input, mime: "image/jpeg" }, member)).toBe(false);
  expect(tokenMatches(token, key, input, { ...member, id: "99999999-2222-4333-8444-555555555555" })).toBe(false);
  expect(tokenMatches(token, key.replace("aaaaaaaa", "bbbbbbbb"), input, member)).toBe(false);
  expect(tokenMatches(token, key, input, member, (expires + 1) * 1000)).toBe(false);
  expect(tokenMatches("garbage", key, input, member)).toBe(false);
});
