#!/usr/bin/env node
/*
 * Rilis (27 Nov 2026): one Vercel build per release, not one per push. Vercel builds only `main`
 * (vercel.json git.deploymentEnabled); every change is pushed to `dev`. This script checks `dev` in a
 * clean copy (npm ci, typecheck, lint, tests, next build), shows what goes out, and only then moves
 * `main` to `dev` (fast-forward). That push is the release: Vercel builds once.
 *
 *   npm run rilis                      check, show, ask, release
 *   npm run rilis -- --cek             check only, release nothing
 *   npm run rilis -- --ya              no question (the owner already said "rilis")
 *   npm run rilis -- --tes-boleh-gagal release even if a test fails (the failures are listed)
 *
 * Remote: REMOTE, else the remote of branch dev, else "origin".
 */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const flags = new Set(process.argv.slice(2));
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const tryGit = (...args) => { try { return git(...args); } catch { return ""; } };
const say = text => console.log(`\n▸ ${text}`);
const stop = text => { console.error(`\n✗ ${text}`); process.exit(1); };
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
/** Runs a step in the clean copy; false when it fails. */
const step = (dir, label, command, args) => {
  say(label);
  const result = spawnSync(command, args, { cwd: dir, stdio: "inherit", shell: process.platform === "win32" });
  return result.status === 0;
};

const remote = process.env.REMOTE || tryGit("config", "--get", "branch.dev.remote") || "origin";
say(`Mengambil ${remote}/dev dan ${remote}/main`);
git("fetch", remote, "dev", "main");
const dev = `${remote}/dev`;
const main = `${remote}/main`;

const going = tryGit("log", "--oneline", "--no-decorate", `${main}..${dev}`);
if (!going) { say("Tidak ada yang baru di dev. Tidak ada yang dirilis."); process.exit(0); }
if (spawnSync("git", ["merge-base", "--is-ancestor", main, dev]).status !== 0) {
  stop(`main punya commit yang belum ada di dev. Gabungkan dulu: git fetch ${remote} && git checkout dev && git merge ${main} && git push ${remote} dev`);
}

// A clean copy of dev, so nothing local (uncommitted work, another session's files) gets checked or released.
const dir = mkdtempSync(join(tmpdir(), "rilis-"));
let ok = true;
let testsFailed = false;
try {
  git("worktree", "add", "--detach", dir, dev);
  if (existsSync(".env")) copyFileSync(".env", join(dir, ".env"));
  ok = step(dir, "Pasang paket (npm ci)", npm, ["ci", "--no-audit", "--no-fund"])
    && step(dir, "Cek tipe", npm, ["run", "typecheck"])
    && step(dir, "Lint", npm, ["run", "lint", "--", "--quiet"]);
  if (ok) testsFailed = !step(dir, "Tes", npm, ["test"]);
  if (ok) ok = step(dir, "Build produksi (lokal, gratis)", npx, ["next", "build"]);
} finally {
  rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  tryGit("worktree", "prune");
}
if (!ok) stop("Cek gagal. Tidak ada yang dirilis. Perbaiki di dev, lalu jalankan lagi.");
if (testsFailed && !flags.has("--tes-boleh-gagal")) stop("Ada tes yang gagal (lihat di atas). Perbaiki dulu, atau jalankan lagi dengan --tes-boleh-gagal kalau gagalnya memang bukan dari rilis ini.");

const count = going.split("\n").length;
console.log(`\nAkan dirilis ${count} commit (dev → main):\n${going}`);
if (flags.has("--cek")) { say("Cek selesai (--cek): tidak ada yang dirilis."); process.exit(0); }
if (!flags.has("--ya")) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("\nRilis sekarang? Ini memicu satu build Vercel. Ketik ya: ")).trim().toLowerCase();
  rl.close();
  if (answer !== "ya") stop("Dibatalkan. Tidak ada yang dirilis.");
}
say(`Mendorong dev ke main (${remote})`);
git("push", remote, `${dev}:refs/heads/main`);
say(`Rilis terkirim: ${count} commit. Vercel membangun main sekali; cek di dasbor Vercel lalu di https://journey.werkudara.group.`);
