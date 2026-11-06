import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bearerKey, hashMcpKey, looksLikeMcpKey, mcpKeyHint, newMcpKey } from "./mcp-key";

describe("MCP keys", () => {
  it("are wam_ and 32 random bytes in base64url", () => {
    const key = newMcpKey();
    expect(key).toMatch(/^wam_[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(key.slice(4), "base64url")).toHaveLength(32);
    expect(looksLikeMcpKey(key)).toBe(true);
    expect(newMcpKey()).not.toBe(key);
  });
  it("are kept only as a sha256 in hex, with the last four characters as a hint", () => {
    const key = newMcpKey();
    expect(hashMcpKey(key)).toBe(createHash("sha256").update(key).digest("hex"));
    expect(hashMcpKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashMcpKey(key)).not.toContain(key.slice(4, 20));
    expect(mcpKeyHint(key)).toBe(key.slice(-4));
  });
  it("refuse anything that is not shaped like a key, before any database read", () => {
    for (const value of ["wam_invalid", "", null, undefined, `wam_${"a".repeat(44)}`, `xyz_${"a".repeat(43)}`, `wam_${"a".repeat(42)}!`]) {
      expect(looksLikeMcpKey(value)).toBe(false);
    }
  });
  it("read a bearer token", () => {
    expect(bearerKey("Bearer wam_abc")).toBe("wam_abc");
    expect(bearerKey("bearer  wam_abc ")).toBe("wam_abc");
    expect(bearerKey("Basic xyz")).toBeNull();
    expect(bearerKey(null)).toBeNull();
  });
});
