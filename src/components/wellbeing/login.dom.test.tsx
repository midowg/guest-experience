import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WLM_DESCRIPTION, WLM_LAUNCH_SCREENS, WLM_TITLE, launchSize, wlmMetadata, wlmTitle } from "@/lib/wellbeing/brand";
import { GET as manifest } from "@/app/wlm/manifest.webmanifest/route";
import { AppLoading } from "@/components/ui/AppLoading";
import { WellbeingLogin } from "./WellbeingLogin";
import { WlmSplash } from "./WlmSplash";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("./font", () => ({ fontVars: "" }));
const request = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/components/pra-wam/api", async original => ({ ...(await original<typeof import("@/components/pra-wam/api")>()), praWamRequest: request.fn }));

afterEach(() => { cleanup(); request.fn.mockReset(); });

/* WLM's own sign-in (18 Nov 2026): the name, plainly the WAM account, no slogan; and what the tab and a shared link say. */
describe("WLM sign-in", () => {
  it("names WLM and says to sign in with the WAM account, without a slogan", () => {
    const { container } = render(<WellbeingLogin next={null} />);
    expect(screen.getByRole("heading", { level: 1, name: "WLM, Werkudara Life Mode. Masuk" })).toBeTruthy();
    expect(screen.getByText("Masuk dengan akun WAM")).toBeTruthy();
    expect(container.textContent).not.toMatch(/Balance Within|Impact Beyond/);
    // Only the name (read once, from the heading); the entrance plays only on the sign-in itself.
    expect(container.querySelector("[data-animated]")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("header svg")).toBeNull();
  });

  it("follows the app's theme (Otomatis unless Terang or Gelap was chosen)", () => {
    const { container, unmount } = render(<WellbeingLogin next={null} />);
    expect(container.firstElementChild?.hasAttribute("data-theme")).toBe(false);
    unmount();
    window.localStorage.setItem("wellbeing-theme", "light");
    const again = render(<WellbeingLogin next={null} />);
    expect(again.container.firstElementChild?.getAttribute("data-theme")).toBe("light");
    window.localStorage.removeItem("wellbeing-theme");
  });

  it("says what is missing, again on every try", async () => {
    render(<WellbeingLogin next={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Masuk" }));
    const first = await screen.findByRole("alert");
    expect(first.textContent).toBe("Isi email atau nama panggilan, dan password.");
    fireEvent.click(screen.getByRole("button", { name: "Masuk" }));
    // A new note (it shakes again), not the old one left in place.
    expect(screen.getByRole("alert")).not.toBe(first);
    expect(request.fn).not.toHaveBeenCalled();
  });

  it("names the tab WLM (it already stands for Werkudara Life Mode) and gives a shared link its card", () => {
    expect(wlmTitle()).toBe("WLM");
    expect(wlmTitle("Peringkat")).toBe("Peringkat · WLM");
    const meta = wlmMetadata("Masuk");
    expect(meta.title).toEqual({ absolute: "Masuk · WLM" });
    expect(JSON.stringify(meta)).not.toMatch(/WLM Werkudara/);
    // A square picture, so the small (square) preview shows all of it.
    expect(meta.openGraph).toMatchObject({ title: WLM_TITLE, description: WLM_DESCRIPTION, images: [{ url: "/wlm/opengraph-image", width: 1080, height: 1080 }] });
    expect(meta.twitter).toMatchObject({ card: "summary" });
    expect(meta.icons).toMatchObject({ icon: [{ url: "/wlm/icon" }, { url: "/wlm/icon-192.png" }], apple: [{ url: "/wlm/apple-icon" }] });
    expect(WLM_DESCRIPTION).toMatch(/akun WAM/);
  });

  it("installs as its own app: the launcher says WLM, shows its icons and opens /wlm; an iPhone gets a launch screen (19 Nov 2026)", async () => {
    const meta = wlmMetadata();
    expect(meta.manifest).toBe("/wlm/manifest.webmanifest");
    const body = await manifest().json();
    expect(body).toMatchObject({ id: "/wlm/", short_name: "WLM", start_url: "/wlm", scope: "/wlm/", display: "standalone", background_color: "#F3F4F6" });
    expect(body.icons.map((icon: { src: string; purpose: string }) => `${icon.src} ${icon.purpose}`)).toEqual(["/wlm/icon-192.png any", "/wlm/icon-512.png any", "/wlm/icon-maskable-512.png maskable"]);
    // One launch screen per iPhone size, each for exactly its screen.
    const startup = (meta.appleWebApp as { startupImage: { url: string; media: string }[] }).startupImage;
    expect(startup).toHaveLength(WLM_LAUNCH_SCREENS.length);
    expect(startup).toContainEqual({ url: "/wlm/launch/1170x2532", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" });
    expect(new Set(WLM_LAUNCH_SCREENS.map(launchSize)).size).toBe(WLM_LAUNCH_SCREENS.length);
  });
});

describe("loading screens (19 Nov 2026)", () => {
  it("shows WLM's own splash: the name, the five bars, the full name, in the person's theme", () => {
    const { container } = render(<WlmSplash />);
    const splash = screen.getByRole("status");
    expect(splash.textContent).toContain("Memuat WLM");
    expect(splash.textContent).toContain("Werkudara Life Mode");
    expect(container.querySelectorAll("[class*='splashBars'] i")).toHaveLength(5);
    // The saved Terang / Gelap is set before the first paint.
    expect(container.querySelector("script")?.innerHTML).toContain("wellbeing-theme");
  });

  it("gives each app its own loading screen, by name", () => {
    render(<AppLoading tone="booking" name="Booking Kantor" />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("data-tone")).toBe("booking");
    expect(status.textContent).toContain("Booking Kantor");
    expect(status.textContent).toContain("Memuat halaman");
  });
});
