import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WLM_DESCRIPTION, WLM_TITLE, wlmMetadata, wlmTitle } from "@/lib/wellbeing/brand";
import { WellbeingLogin } from "./WellbeingLogin";

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
    expect(meta.icons).toMatchObject({ icon: [{ url: "/wlm/icon" }], apple: [{ url: "/wlm/apple-icon" }] });
    expect(WLM_DESCRIPTION).toMatch(/akun WAM/);
  });
});
