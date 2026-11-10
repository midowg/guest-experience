import { createHash, randomBytes } from "node:crypto";

/*
 * TV Announcement keys (server only: node:crypto), as MCP keys are made (mcp-key.ts). A TV has no
 * sign-in: its address holds `tv_` and 32 random bytes in base64url. The address is shown once,
 * when the TV is added, and only the key's sha256 is kept, so a database leak gives no working address.
 */

export const TV_KEY_PREFIX = "tv_";
const KEY_PATTERN = /^tv_[A-Za-z0-9_-]{43}$/;

export const newTvKey = (): string => `${TV_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
/** Whether a string has the shape of a key at all (checked before any database read). */
export const looksLikeTvKey = (value: unknown): value is string => typeof value === "string" && KEY_PATTERN.test(value);
export const hashTvKey = (key: string): string => createHash("sha256").update(key, "utf8").digest("hex");
/** The last four characters, so the admin can tell addresses apart. */
export const tvKeyHint = (key: string): string => key.slice(-4);
