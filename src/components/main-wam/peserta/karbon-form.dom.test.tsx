import axe from "axe-core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { sampleCarbonAnswer, sampleCarbonModel, sampleCarbonOwnAnswer } from "@/lib/main-wam/peserta/sample";
import { samplePeople } from "@/lib/main-wam/sample";
import { setActiveLang } from "@/lib/main-wam/i18n";
import { LangProvider } from "@/components/main-wam/i18n";
import { mainWamApi } from "@/lib/routes";
import { CarbonScreen } from "./karbon/CarbonScreen";

/* Jejak karbon's calculator (24 Nov 2026, as Pra WAM's): typing, the sheet for one's own trip, validation, saving, closed, no storage. */

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => "/wam2026" }));
vi.mock("@/components/main-wam/theme/font", () => ({ mainWamFontVars: "" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
beforeEach(() => { window.history.replaceState(null, "", "/wam2026"); });
afterEach(() => { cleanup(); setActiveLang("id"); vi.unstubAllGlobals(); });

const NOW = "2027-01-04T21:00:00+07:00";
const model = (over: Partial<Parameters<typeof sampleCarbonModel>[0]> = {}) => sampleCarbonModel({ now: NOW, ...over });
const total = () => screen.getByRole("article").querySelector("[aria-live]")!.textContent;
const field = (name: RegExp | string) => screen.getByRole("spinbutton", { name }) as HTMLInputElement;

async function violations(): Promise<string[]> {
  const result = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  return result.violations.map(violation => `${violation.id}: ${violation.nodes.map(node => node.html.slice(0, 160)).join(" | ")}`);
}

/** The fetch the page calls to save: answers with the data it was sent. */
function stubSave(response: { ok: boolean; status?: number; body: unknown }) {
  const fetchMock = vi.fn(async () => ({ ok: response.ok, status: response.status ?? 200, json: async () => response.body }) as unknown as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Jejak karbon: kalkulator", () => {
  it("six tiles: what the event's data fills says so, the person's three are fields, each with its kilograms", () => {
    render(<CarbonScreen model={model()} />);
    expect(screen.getByRole("heading", { level: 2, name: "Hitung jejakmu" })).toBeTruthy();
    for (const name of ["Perjalanan", "Kamar", "Makan"]) {
      const tile = screen.getByRole("region", { name });
      expect(within(tile).getByText("Dari data acara")).toBeTruthy();
      expect(tile.textContent).toMatch(/\d(,\d)? kg|\d+ kg/);
    }
    expect(screen.getByRole("region", { name: "Kamar" }).textContent).toContain("Sekamar 3 orang");
    for (const name of ["Botol plastik", "Laptop", "Isi daya HP"]) expect(field(name).value).toBe("");
    expect(screen.getByRole("button", { name: "Simpan" })).toBeTruthy();
  });

  it("typing counts at once: the total on top and the tile follow, before anything is saved", () => {
    render(<CarbonScreen model={model()} />);
    const before = total();
    fireEvent.change(field("Botol plastik"), { target: { value: "20" } });
    expect(total()).not.toBe(before);
    expect(screen.getByText("2,0 kg", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("Belum disimpan")).toBeTruthy();
    fireEvent.change(field("Botol plastik"), { target: { value: "" } });
    expect(total()).toBe(before);
  });

  it("the saved answer is shown filled in", () => {
    render(<CarbonScreen model={model({ answer: sampleCarbonAnswer })} />);
    expect(field("Botol plastik").value).toBe("6");
    expect(field("Laptop").value).toBe("14");
    expect(field("Isi daya HP").value).toBe("5");
    expect(screen.queryByText("Belum disimpan")).toBeNull();
  });

  it("over the limit: said in words (Maksimal 50 botol), and Simpan sends nothing", async () => {
    const fetchMock = stubSave({ ok: true, body: { ok: true, data: {} } });
    render(<CarbonScreen model={model()} />);
    fireEvent.change(field("Botol plastik"), { target: { value: "51" } });
    expect(screen.getByText("Maksimal 50 botol")).toBeTruthy();
    expect(field("Botol plastik").getAttribute("aria-invalid")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Berangkat sendiri opens a sheet; an incomplete trip is refused in words, a complete one replaces the group's trip", () => {
    render(<CarbonScreen model={model()} />);
    const before = total();
    fireEvent.click(screen.getByRole("button", { name: "Berangkat sendiri?" }));
    const sheet = screen.getByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Pakai perjalanan ini" }));
    expect(within(sheet).getAllByText("Isi asal dan jarak 1–3.000 km.").length).toBeGreaterThan(0);
    fireEvent.change(within(sheet).getByRole("textbox", { name: "Dari" }), { target: { value: "Magelang" } });
    fireEvent.click(within(sheet).getByRole("radio", { name: "Mobil" }));
    fireEvent.change(within(sheet).getByRole("spinbutton", { name: /Jarak sekali jalan/ }), { target: { value: "410" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Pakai perjalanan ini" }));
    expect(total()).not.toBe(before);
    expect(screen.getByRole("region", { name: "Perjalanan" }).textContent).toContain("Berangkat sendiri dari Magelang");
    expect(screen.getByRole("region", { name: "Perjalanan" }).textContent).toContain("820");
    expect(screen.getByRole("button", { name: "Ubah" })).toBeTruthy();
  });

  it("Ikut rombongan in the sheet takes the person back to the group's trip", () => {
    render(<CarbonScreen model={model({ answer: sampleCarbonOwnAnswer })} />);
    expect(screen.getByRole("region", { name: "Perjalanan" }).textContent).toContain("Magelang");
    fireEvent.click(screen.getByRole("button", { name: "Ubah" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Ikut rombongan" }));
    expect(screen.getByRole("region", { name: "Perjalanan" }).textContent).toContain("Kereta 1.040 km");
  });

  it("Lainnya is not counted and says so", () => {
    render(<CarbonScreen model={model()} initialSheet />);
    const sheet = screen.getByRole("dialog");
    fireEvent.click(within(sheet).getByRole("radio", { name: "Lainnya" }));
    expect(within(sheet).getByText(/Lainnya belum dihitung/)).toBeTruthy();
    expect(within(sheet).queryByRole("spinbutton")).toBeNull();
  });

  it("Simpan keeps it: PUT with the answer, waits, then 'Jejak karbon disimpan' state clears 'Belum disimpan'", async () => {
    const fetchMock = stubSave({ ok: true, body: { ok: true, data: { own: null, bottles: 3, laptopHours: 0, phoneCharges: 0, answeredAt: NOW }, message: "ok" } });
    render(<CarbonScreen model={model()} />);
    fireEvent.change(field("Botol plastik"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(mainWamApi.carbon);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ own: null, bottles: 3, laptopHours: 0, phoneCharges: 0 });
    await waitFor(() => expect(screen.queryByText("Belum disimpan")).toBeNull());
  });

  it("a failed save says why above the button and keeps what was typed", async () => {
    stubSave({ ok: false, status: 409, body: { ok: false, message: "Pengisian sudah ditutup." } });
    render(<CarbonScreen model={model()} />);
    fireEvent.change(field("Laptop"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Pengisian sudah ditutup.");
    expect(field("Laptop").value).toBe("8");
  });

  it("closed: the fields are read-only, no Simpan, and it says so", () => {
    render(<CarbonScreen model={model({ open: false, answer: sampleCarbonAnswer })} />);
    expect(screen.queryByRole("button", { name: "Simpan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Berangkat sendiri?" })).toBeNull();
    expect(field("Botol plastik").disabled).toBe(true);
    expect(screen.getByText("Pengisian sudah ditutup.")).toBeTruthy();
  });

  it("without storage (before the system update): it still counts, Simpan is off and the reason is beside it", () => {
    render(<CarbonScreen model={model({ storage: "waiting" })} />);
    expect((screen.getByRole("button", { name: "Simpan" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/menunggu pembaruan sistem/)).toBeTruthy();
    const before = total();
    fireEvent.change(field("Botol plastik"), { target: { value: "20" } });
    expect(total()).not.toBe(before);
  });

  it("a sample saves nothing: no request, still says it is a sample", async () => {
    const fetchMock = stubSave({ ok: true, body: { ok: true, data: {} } });
    render(<CarbonScreen model={model()} sample />);
    expect(screen.getByText("Contoh: isianmu tidak disimpan di tampilan ini.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await new Promise(resolve => setTimeout(resolve, 600));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("privacy: no other person's name anywhere on the page", () => {
    const { container } = render(<CarbonScreen model={model({ answer: sampleCarbonOwnAnswer })} howOpen />);
    for (const person of Object.values(samplePeople)) expect(container.textContent, person.name).not.toContain(person.name);
  });

  it("no cut text: nothing on the page is clipped by ellipsis or nowrap, and the tiles wrap in a grid that folds to one column", () => {
    const { container } = render(<CarbonScreen model={model()} />);
    expect(container.querySelectorAll("form").length).toBe(1);
    // Text is never given a fixed single line: the stylesheet has no ellipsis or clamp (the kit's rule 15).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cssText = require("node:fs").readFileSync(require("node:path").join(process.cwd(), "src/components/main-wam/peserta/karbon/karbon.module.css"), "utf8") as string;
    expect(cssText).not.toMatch(/text-overflow:\s*ellipsis|line-clamp/);
    expect(cssText).toMatch(/\.tiles\s*{[^}]*repeat\(auto-fit,\s*minmax\(152px/);
  });

  it("in English", () => {
    render(<LangProvider lang="en"><CarbonScreen model={model()} /></LangProvider>);
    expect(screen.getByRole("heading", { level: 2, name: "Count your footprint" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Travelling on your own?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getAllByText("From the event's data").length).toBe(3);
  });

  it("axe finds nothing to fix (page, sheet open, closed)", async () => {
    render(<CarbonScreen model={model({ answer: sampleCarbonOwnAnswer })} howOpen />);
    expect(await violations()).toEqual([]);
    cleanup();
    render(<CarbonScreen model={model()} initialSheet />);
    expect(await violations()).toEqual([]);
    cleanup();
    render(<CarbonScreen model={model({ open: false })} />);
    expect(await violations()).toEqual([]);
  });
});
