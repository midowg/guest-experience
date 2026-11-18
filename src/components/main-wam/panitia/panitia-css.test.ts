import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "panitia.module.css"), "utf8");
const rule = (selector: string) => css.split("\n").find(line => line.startsWith(`${selector} {`)) ?? "";

describe("panitia layout rules (audit UI/UX per perangkat)", () => {
  it("a Rundown live row wraps its actions under the text on a narrow screen instead of squeezing or clipping", () => {
    expect(rule(".rrow")).toContain("flex-wrap: wrap");
    expect(rule(".rrowActions")).toContain("flex-wrap: wrap");
    expect(rule(".rrowText")).toMatch(/flex: 1 1 \d/);
  });
  it("the 'diubah oleh' line may wrap (no nowrap that spills out of its row)", () => {
    expect(rule(".edited")).not.toContain("nowrap");
  });
});
