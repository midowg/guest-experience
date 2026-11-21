import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { carbonView } from "@/lib/main-wam/peserta/carbon";
import { sampleCarbon } from "@/lib/main-wam/peserta/sample";
import { contactLinks } from "@/lib/main-wam/peserta/contact";
import { LangProvider } from "@/components/main-wam/i18n";
import { setActiveLang } from "@/lib/main-wam/i18n";
import { samplePeople, sampleRoom3 } from "@/lib/main-wam/sample";
import { mainWamPath, praWamPath } from "@/lib/routes";
import { CarbonCard } from "./karbon/CarbonCard";
import { CarbonScreen } from "./karbon/CarbonScreen";
import { RoomScreen } from "./saya/RoomScreen";
import { SettingsScreen } from "./saya/SettingsScreen";

/* Jejak karbon (card and page), Kamar and Pengaturan (revisi 18 Nov) as people use them. */

const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/wam2026" }));
vi.mock("@/components/main-wam/theme/font", () => ({ mainWamFontVars: "" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
beforeEach(() => { window.history.replaceState(null, "", "/wam2026"); Object.values(router).forEach(fn => fn.mockClear()); });
afterEach(() => { cleanup(); setActiveLang("id"); });

const NOW = new Date("2027-01-04T21:00:00+07:00");
const view = (lang: "id" | "en" = "id") => carbonView(sampleCarbon(), NOW, lang);

/** Rules that jsdom can judge (no colours or layout): names, roles, structure. */
async function violations(): Promise<string[]> {
  const result = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  return result.violations.map(violation => `${violation.id}: ${violation.nodes.map(node => node.html.slice(0, 160)).join(" | ")}`);
}

describe("Jejak karbon: kartu Beranda", () => {
  it("one link to the page with the name, the total and 'perkiraan'", () => {
    render(<CarbonCard view={view()} />);
    const card = screen.getByRole("link", { name: /Jejak karbon/ });
    expect(card.getAttribute("href")).toBe(mainWamPath.carbon());
    expect(card.textContent).toContain("13,3");
    expect(card.textContent).toContain("t CO₂e");
    expect(card.textContent).toContain("perkiraan");
    expect(card.getAttribute("aria-label")).toBeNull();
  });

  it("a thin stacked bar (decoration) and a one-line legend that says every source with its percentage", () => {
    const { container } = render(<CarbonCard view={view()} />);
    const bar = container.querySelector('[aria-hidden="true"][class*="bar"]');
    expect(bar).toBeTruthy();
    expect(bar!.querySelectorAll("span").length).toBe(3);
    const legend = container.querySelector("ul")!;
    expect(legend.querySelectorAll("li").length).toBe(3);
    expect(legend.textContent).toMatch(/Hotel\s*\d+%/);
    expect(legend.textContent).toMatch(/Perjalanan\s*\d+%/);
    expect(legend.textContent).toMatch(/Makan\s*\d+%/);
  });

  it("a green tile: leaf icon, one line 'perkiraan · sources', the total at the end, no second link", () => {
    const { container } = render(<CarbonCard view={view()} />);
    const link = screen.getByRole("link", { name: /Jejak karbon/ });
    expect(container.querySelectorAll("a").length).toBe(1);
    expect(link.querySelector("svg.lucide-leaf")).toBeTruthy();
    expect(link.textContent).toMatch(/perkiraan\s·\sHotel\s\d+%\sPerjalanan\s\d+%\sMakan\s\d+%/);
    expect(link.querySelector('[class*="tileNumber"]')!.textContent).toBe("13,3");
  });

  it("nothing counted yet: says so kindly and still opens the page; from Saya it keeps Saya's address", () => {
    render(<CarbonCard view={{ kind: "belum" }} from="saya" />);
    const card = screen.getByRole("link", { name: /Perkiraan belum tersedia/ });
    expect(card.getAttribute("href")).toBe(mainWamPath.carbon("saya"));
    expect(card.querySelector("ul")).toBeNull();
  });

  it("speaks English", () => {
    render(<LangProvider lang="en"><CarbonCard view={view("en")} /></LangProvider>);
    expect(screen.getByRole("link", { name: /Carbon trail/ }).textContent).toContain("13.3");
  });
});

describe("Jejak karbon: halaman", () => {
  it("follows the design's order: total with per person and time, where it comes from, how it is counted, the note", () => {
    const { container } = render(<CarbonScreen view={view()} />);
    const text = container.textContent ?? "";
    const order = ["Emisi WAM 2026", "Perkiraan", "13,3", "±111 kg per orang", "Diperbarui Sen, 4 Jan · 21.00", "Dari mana asalnya", "Hotel", "Perjalanan", "Makan", "Katalog emisi", "dihitung otomatis dari data acara"];
    let at = -1;
    for (const part of order) { const next = text.indexOf(part, at + 1); expect(next, part).toBeGreaterThan(at); at = next; }
    expect(screen.getByRole("heading", { level: 2, name: "Dari mana asalnya" })).toBeTruthy();
  });

  it("every source is a row with its name, amount, share and what was counted (not colour alone)", () => {
    render(<CarbonScreen view={view()} />);
    const sources = screen.getByRole("list", { name: "Sumber emisi" });
    expect(within(sources).getByText("≈7,2 t · 54%")).toBeTruthy();
    expect(within(sources).getByText("60 kamar × 3 malam")).toBeTruthy();
    expect(within(sources).getByText("Kereta, shuttle")).toBeTruthy();
    expect(within(sources).getByText("1.440 porsi")).toBeTruthy();
  });

  it("Katalog emisi is closed and opens on a tap: the formula, every factor with its unit, Perlu dicek, no offsetting", () => {
    render(<CarbonScreen view={view()} />);
    const how = screen.getByRole("button", { name: /^Katalog emisi/ });
    expect(how.getAttribute("aria-expanded")).toBe("false");
    const formula = screen.getByText("Emisi = data kegiatan × faktor emisi.");
    expect(formula.closest("[hidden]")).not.toBeNull();
    fireEvent.click(how);
    expect(how.getAttribute("aria-expanded")).toBe("true");
    expect(formula.closest("[hidden]")).toBeNull();
    const rows = within(how.closest("div")!).getAllByRole("listitem");
    expect(rows).toHaveLength(8);
    expect(rows[0].textContent).toContain("Kereta");
    expect(rows[0].textContent).toContain("0,0164");
    expect(rows[3].textContent).toContain("40");
    expect(screen.getByText("Perlu dicek")).toBeTruthy();
    expect(screen.getByText(/tanpa penebusan, pohon, atau kontribusi/)).toBeTruthy();
    fireEvent.click(how);
    expect(formula.closest("[hidden]")).not.toBeNull();
  });

  it("has no tree, payment or form, only reading (the catalogue says so: recorded, never offset)", () => {
    const { container } = render(<CarbonScreen view={view()} howOpen />);
    expect(container.querySelector("input, textarea, select, form")).toBeNull();
    expect(container.textContent).not.toMatch(/bayar|donasi/i);
    expect(container.querySelector("a[href]")).toBeNull();
    // The words about offsetting appear only to say there is none.
    expect(container.textContent).toMatch(/tanpa penebusan, pohon, atau kontribusi/);
    expect((container.textContent?.match(/penebusan|pohon|kontribusi/gi) ?? []).length).toBe(3);
  });

  it("nothing counted yet: a friendly empty state, no numbers", () => {
    render(<CarbonScreen view={{ kind: "belum" }} />);
    expect(screen.getByRole("heading", { name: "Perkiraan belum tersedia" })).toBeTruthy();
    expect(screen.queryByText("t CO₂e")).toBeNull();
  });

  it("in English", () => {
    render(<LangProvider lang="en"><CarbonScreen view={view("en")} /></LangProvider>);
    expect(screen.getByText("Where it comes from")).toBeTruthy();
    expect(screen.getByText("±111 kg per person")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Emission catalogue/ })).toBeTruthy();
  });

  it("axe finds nothing to fix (card, page, empty page)", async () => {
    render(<><CarbonCard view={view()} /><CarbonScreen view={view()} howOpen /></>);
    expect(await violations()).toEqual([]);
    cleanup();
    render(<CarbonScreen view={{ kind: "belum" }} />);
    expect(await violations()).toEqual([]);
  });
});

describe("Jejak karbon: warna batang", () => {
  const css = readFileSync(join(process.cwd(), "src/components/main-wam/theme/theme.module.css"), "utf8");
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const all = (name: string) => [...css.matchAll(new RegExp(`--mw-${name}: (#[0-9A-Fa-f]{6});`, "g"))].map(match => match[1]);

  it("each segment is at least 3:1 on the page and on a card, light and dark (the system block repeats the dark one)", () => {
    const segments = [1, 2, 3].map(n => all(`chart-emisi-${n}`));
    const bg = all("bg"), surface = all("surface");
    expect(segments.map(list => list.length)).toEqual([3, 3, 3]);
    // [light, dark, system-dark]
    for (const mode of [0, 1, 2]) for (const list of segments) {
      expect(ratio(list[mode], bg[mode]), `${list[mode]} on bg`).toBeGreaterThanOrEqual(3);
      expect(ratio(list[mode], surface[mode]), `${list[mode]} on surface`).toBeGreaterThanOrEqual(3);
    }
    expect(segments.map(list => list[1])).toEqual(segments.map(list => list[2]));
  });
});

describe("Kamar", () => {
  const room = { name: "208", sub: "Lantai 2 · 3 orang", note: "Dekat lift.", people: sampleRoom3.people };
  const roomHelp = { id: samplePeople.putri.id, name: "Putri", role: "Panitia kamar", photo: null, ...contactLinks("0800-0000-0002") };

  it("the room and its people, check-in and check-out, Bantuan kamar; no kelompok anywhere", () => {
    const { container } = render(<RoomScreen room={room} stay={{ checkIn: "Sen, 4 Jan · 15.30", checkOut: "Kam, 7 Jan · 10.00" }} roomHelp={roomHelp} />);
    expect(screen.getByRole("heading", { name: "Kamar 208" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Penghuni Kamar 208, 3 orang" }).children.length).toBe(3);
    expect(screen.getByText("Check-in")).toBeTruthy();
    expect(screen.getByText("Check-out")).toBeTruthy();
    expect(container.textContent).not.toMatch(/kelompok|Koordinator|Pos \d/i);
    fireEvent.click(screen.getByRole("button", { name: "Bantuan kamar" }));
    expect(screen.getByRole("dialog", { name: "Bantuan kamar" })).toBeTruthy();
  });

  it("any number of people, and not published yet", () => {
    const many = { ...room, people: [...sampleRoom3.people, ...sampleRoom3.people.map((person, index) => ({ ...person, id: `x${index}`, me: false }))] };
    const { unmount } = render(<RoomScreen room={many} stay={{ checkIn: "", checkOut: "" }} roomHelp={null} />);
    expect(screen.getByRole("list", { name: "Penghuni Kamar 208, 6 orang" }).children.length).toBe(6);
    expect(screen.queryByText("Check-in")).toBeNull();
    unmount();
    render(<RoomScreen room={null} stay={{ checkIn: "", checkOut: "" }} roomHelp={null} />);
    expect(screen.getByRole("heading", { name: "Kamar belum diterbitkan" })).toBeTruthy();
  });

  it("axe finds nothing to fix", async () => {
    render(<RoomScreen room={room} stay={{ checkIn: "Sen, 4 Jan · 15.30", checkOut: "" }} roomHelp={roomHelp} />);
    expect(await violations()).toEqual([]);
  });
});

describe("Pengaturan", () => {
  const help = { id: samplePeople.putri.id, name: "Putri", role: "Panitia", photo: null, ...contactLinks("0800-0000-0002") };
  const screenOf = (extra: Partial<Parameters<typeof SettingsScreen>[0]> = {}) => <SettingsScreen version="0.1.0" help={help} preview={{ push: "on", installed: false }} {...extra} />;

  it("four groups in order, Tampilan first with its controls inline", () => {
    const { container } = render(screenOf());
    const text = container.textContent ?? "";
    let at = -1;
    for (const part of ["Tampilan", "Tema", "Bahasa", "Kurangi gerak", "Aplikasi", "Notifikasi", "Pasang ke layar utama", "Akun", "Ganti password", "Bantuan", "Hubungi panitia", "WAM 2026 · versi 0.1.0"]) {
      const next = text.indexOf(part, at + 1); expect(next, part).toBeGreaterThan(at); at = next;
    }
    expect(screen.getAllByRole("heading", { level: 2 }).map(heading => heading.textContent)).toEqual(["Tampilan", "Aplikasi", "Akun", "Bantuan"]);
    expect(screen.getByRole("link", { name: /^Bantuan/ }).getAttribute("href")).toBe(mainWamPath.help);
    expect(screen.getByRole("button", { name: /^Notifikasi/ }).textContent).toContain("Aktif");
  });

  it("Pasang ke layar utama opens the steps for the device (the existing install guide)", () => {
    render(screenOf());
    fireEvent.click(screen.getByRole("button", { name: /^Pasang ke layar utama/ }));
    const dialog = screen.getByRole("dialog", { name: "Pasang ke layar utama" });
    expect(within(dialog).getByRole("radio", { name: "iPhone" })).toBeTruthy();
    expect(within(dialog).getAllByRole("listitem").length).toBeGreaterThanOrEqual(2);
  });

  it("says it is already installed when opened from the home screen", () => {
    render(screenOf({ preview: { push: "on", installed: true } }));
    expect(screen.getByRole("button", { name: /^Pasang ke layar utama/ }).textContent).toContain("Sudah terpasang di layar utama.");
  });

  it("Tema: Terang, Gelap, Sistem in the row itself; a pick is painted and kept at once", () => {
    render(screenOf({ mode: "system" }));
    for (const name of ["Terang", "Gelap", "Sistem"]) expect(screen.getByRole("radio", { name })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Sistem" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Gelap" }));
    expect(document.cookie).toContain("mw_mode=dark");
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: "Gelap" }).getAttribute("aria-checked")).toBe("true");
  });

  it("Bahasa: ID and EN with a flag each, in the row; EN changes the screen at once", () => {
    const { container } = render(<LangProvider lang="id">{screenOf()}</LangProvider>);
    expect(screen.getByRole("radio", { name: "ID" }).getAttribute("aria-checked")).toBe("true");
    expect(container.querySelectorAll("[role=radio] svg[data-flag]")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /^Bahasa/ })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "EN" }));
    expect(screen.getByRole("heading", { level: 2, name: "App", hidden: true })).toBeTruthy();
  });

  it("Kurangi gerak: a switch level with its title, kept in a cookie and on the app root", () => {
    const { container } = render(<div data-main-wam="">{screenOf()}</div>);
    const toggle = screen.getByRole("switch", { name: "Kurangi gerak" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(document.cookie).toContain("mw_motion=reduce");
    expect(container.querySelector("[data-main-wam]")?.hasAttribute("data-mw-reduce")).toBe(true);
    fireEvent.click(toggle);
    expect(container.querySelector("[data-main-wam]")?.hasAttribute("data-mw-reduce")).toBe(false);
  });

  it("Ganti password and Hubungi panitia open their sheets; without a contact there is no such row", () => {
    const { unmount } = render(screenOf());
    fireEvent.click(screen.getByRole("button", { name: /^Ganti password/ }));
    expect(screen.getByRole("dialog", { name: "Ganti password" })).toBeTruthy();
    unmount();
    const second = render(screenOf());
    fireEvent.click(screen.getByRole("button", { name: /^Hubungi panitia/ }));
    expect(screen.getByRole("dialog", { name: "Hubungi panitia" })).toBeTruthy();
    second.unmount();
    render(screenOf({ help: null }));
    expect(screen.queryByRole("button", { name: /^Hubungi panitia/ })).toBeNull();
  });

  it("Akses MCP at the foot only with access", () => {
    const { unmount } = render(screenOf());
    expect(screen.queryByRole("link", { name: /Akses MCP/ })).toBeNull();
    unmount();
    render(screenOf({ mcp: true }));
    expect(screen.getByRole("link", { name: /Akses MCP/ }).getAttribute("href")).toBe(`${praWamPath.settings}#mcp`);
  });

  it("axe finds nothing to fix, also with a sheet open", async () => {
    render(screenOf({ mcp: true }));
    expect(await violations()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /^Pasang ke layar utama/ }));
    expect(await violations()).toEqual([]);
  });
});
