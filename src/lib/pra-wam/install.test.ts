import { describe, expect, it } from "vitest";
import { detectInstall, installDevices, installSteps, notificationSteps } from "./install";

describe("Install WAM", () => {
  it("opens on the device and browser it is looked at in", () => {
    expect(detectInstall("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toEqual({ device: "iphone", browser: "safari" });
    expect(detectInstall("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148 Safari/604.1")).toEqual({ device: "iphone", browser: "chrome-ios" });
    // iPadOS asks for the desktop site: a "Mac" with a touch screen.
    expect(detectInstall("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15", 5)).toEqual({ device: "iphone", browser: "safari" });
    expect(detectInstall("Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36")).toEqual({ device: "android", browser: "chrome-android" });
    expect(detectInstall("Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36")).toEqual({ device: "android", browser: "samsung" });
    expect(detectInstall("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0")).toEqual({ device: "laptop", browser: "edge" });
    expect(detectInstall("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15")).toEqual({ device: "laptop", browser: "safari-mac" });
    expect(detectInstall("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36")).toEqual({ device: "laptop", browser: "chrome-desktop" });
  });

  it("has steps for every browser it offers, and notification steps that end with the blocked case", () => {
    for (const device of installDevices) {
      for (const browser of device.browsers) expect(installSteps[browser].length).toBeGreaterThan(0);
      const steps = notificationSteps(device.id);
      expect(steps.at(-1)?.title).toMatch(/^Terblokir\?/);
    }
    expect(notificationSteps("iphone")[0].text).toMatch(/bukan dari Safari/);
  });
});
