import { createHash, randomBytes } from "node:crypto";

/*
 * MCP WAM keys (server only: node:crypto). A key is `wam_` and 32 random bytes in base64url; it is
 * shown to its owner once, and only its sha256 is kept, so a database leak gives no working key.
 * Kept apart from mcp.ts, which pages in the browser also import.
 */

export const MCP_KEY_PREFIX = "wam_";
const KEY_PATTERN = /^wam_[A-Za-z0-9_-]{43}$/;

export const newMcpKey = (): string => `${MCP_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
/** Whether a string has the shape of a key at all (checked before any database read). */
export const looksLikeMcpKey = (value: unknown): value is string => typeof value === "string" && KEY_PATTERN.test(value);
export const hashMcpKey = (key: string): string => createHash("sha256").update(key, "utf8").digest("hex");
/** The last four characters, so the owner can tell keys apart. */
export const mcpKeyHint = (key: string): string => key.slice(-4);

/** The key from `Authorization: Bearer <key>`, or null. */
export function bearerKey(header: string | null): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return match ? match[1] : null;
}
