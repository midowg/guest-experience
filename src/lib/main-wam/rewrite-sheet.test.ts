import { describe, expect, it } from "vitest";
import config from "../../../next.config";

describe("/wam2026 rewrite and the Detail sesi sheet", () => {
  it("is a beforeFiles rewrite, so Next's intercepting route (source /wam/acara/agenda/:id) still matches", async () => {
    const rewrites = await config.rewrites!();
    // Next adds the interception rewrites to beforeFiles; a plain array is afterFiles and would be tried too late
    // (a tap on a session then opened the full Agenda page, not the sheet over the screen).
    expect(Array.isArray(rewrites)).toBe(false);
    const { beforeFiles } = rewrites as { beforeFiles: { source: string; destination: string }[] };
    expect(beforeFiles).toContainEqual({ source: "/wam2026/:path*", destination: "/wam/acara/:path*" });
    expect(beforeFiles).toContainEqual({ source: "/wam2026", destination: "/wam/acara" });
  });
});
