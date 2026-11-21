import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Banner } from "./Feedback";
import { TextField } from "./Form";
import { ListRow, StatRow } from "./List";
import { Segmented } from "./Segmented";
import { Sheet } from "./Sheet";
import { ShortcutTile } from "./Data";
import { TopBar } from "./TopBar";
import { focusables } from "./useModal";

/*
 * Fase 4 kit findings (audit UX "Kit dan shell" and the kit parts of other areas): names that start
 * with the words on screen (T-S05, ShortcutTile), no empty h1 (T-S04/T-P05), the offline icon
 * (T-P08), the counter's numbers (T-D02), the Tab loop past a roving radio group (T-M01), focus
 * back to the opener when a sheet is removed while open (T-K01), and the CSS rules for 320 px and
 * zoom 200 % (Segmented, SessionRow, StackPreview, the bottom bar, the skip link, sheets on desktop).
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
beforeEach(() => { window.history.replaceState(null, "", "/wam2026"); });
afterEach(() => { cleanup(); });

/** axe's WCAG 2.5.3 rule (experimental, so switched on by name) on what is rendered. */
async function labelInName(): Promise<string[]> {
  const result = await axe.run(document.body, { runOnly: { type: "rule", values: ["label-content-name-mismatch"] }, rules: { "label-content-name-mismatch": { enabled: true } } });
  return result.violations.flatMap(violation => violation.nodes.map(node => node.html));
}

describe("names start with the words on screen (WCAG 2.5.3)", () => {
  it("ShortcutTile: 'Moderasi, 3 laporan', and axe finds no mismatch", async () => {
    render(<ShortcutTile icon={<span />} label="Moderasi" badge={3} badgeLabel="laporan" href="/wam2026/kelola/moderasi" />);
    // (The hidden words are a separate box, so the computed name has a space before the comma.)
    const tile = screen.getByRole("link", { name: /^Moderasi\s*, 3 laporan$/ });
    expect(tile.getAttribute("aria-label")).toBeNull();
    expect(await labelInName()).toEqual([]);
  });

  it("ShortcutTile without a count is just its label", () => {
    render(<ShortcutTile icon={<span />} label="Rundown live" href="/x" />);
    expect(screen.getByRole("link", { name: "Rundown live" })).toBeTruthy();
  });

  it("ListRow and StatRow: `spoken` is said after the row's own words", async () => {
    render(<>
      <ListRow title="Rani" sub="07.52 · Scan QR" spoken="ketuk untuk membatalkan" onClick={() => undefined} />
      <StatRow icon={<span />} title="Kehadiran hari ini" value="93%" spoken="lihat per sesi" href="/x" />
    </>);
    expect(screen.getByRole("button", { name: /^Rani\s*07\.52 · Scan QR\s*, ketuk untuk membatalkan$/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Kehadiran hari ini.*93%\s*, lihat per sesi$/ })).toBeTruthy();
    expect(await labelInName()).toEqual([]);
  });
});

describe("TopBar without a title (P04 'Kepala tanpa judul', T02)", () => {
  it("names the screen with a hidden h1 when given a label", () => {
    render(<TopBar variant="back" title="" label="Detail sesi" backHref="/wam2026/agenda" />);
    const heading = screen.getByRole("heading", { level: 1, name: "Detail sesi" });
    expect(heading.className).toMatch(/srOnly/);
  });

  it("draws no empty h1 without one", () => {
    render(<TopBar variant="back" title="" backHref="/wam2026/agenda" />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByRole("link", { name: "Kembali" })).toBeTruthy();
  });
});

describe("small words", () => {
  it("Banner offline: cloud-off, as Beranda and Agenda (T-P08)", () => {
    const { container } = render(<Banner tone="offline">Kamu sedang offline.</Banner>);
    expect(container.querySelector("svg")?.getAttribute("class")).toMatch(/lucide-cloud-off/);
  });

  it("counter: '90/1.000' (T-D02)", () => {
    render(<TextField multiline label="Masukan" value={"x".repeat(90)} onChange={() => undefined} maxLength={1000} showCount />);
    expect(screen.getByText(/90\/1\.000/)).toBeTruthy();
  });
});

describe("focus inside sheets", () => {
  it("focusables skips the unchosen radios of a roving group (tabindex -1)", () => {
    const root = document.createElement("div");
    root.innerHTML = '<button>Tutup</button><div role="radiogroup"><button role="radio" tabindex="0">Umum</button><button role="radio" tabindex="-1">Sarapan</button></div>';
    expect(focusables(root).map(element => element.textContent)).toEqual(["Tutup", "Umum"]);
  });

  it("Tab from the chosen radio, the last stop, goes back to Tutup, never to the page (T-M01)", () => {
    function Choose() {
      const [value, setValue] = useState<"umum" | "sarapan" | "pemaparan">("umum");
      return <Sheet open onClose={() => undefined} title="Saring sesi" history={false}>
        <Segmented label="Sesi" value={value} onChange={setValue} options={[{ value: "umum", label: "Umum" }, { value: "sarapan", label: "Sarapan" }, { value: "pemaparan", label: "Pemaparan" }]} />
      </Sheet>;
    }
    render(<Choose />);
    const chosen = screen.getByRole("radio", { name: "Umum" });
    chosen.focus();
    const dialog = screen.getByRole("dialog");
    act(() => { fireEvent.keyDown(dialog, { key: "Tab" }); });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Tutup" }));
    act(() => { fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true }); });
    expect(document.activeElement).toBe(chosen);
  });

  it("a sheet rendered only while open goes back to its opener when removed (T-K01: K02 → Ubah jam)", () => {
    function Row() {
      const [open, setOpen] = useState(false);
      return <>
        <button type="button" onClick={() => setOpen(true)}>Ubah jam</button>
        {open && <Sheet open onClose={() => setOpen(false)} title="Ubah jam" history={false}><button type="button" onClick={() => setOpen(false)}>Batal</button></Sheet>}
      </>;
    }
    render(<Row />);
    const opener = screen.getByRole("button", { name: "Ubah jam" });
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).not.toBe(opener);
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("a sheet removed while focus is already elsewhere leaves focus alone", () => {
    function Row() {
      const [open, setOpen] = useState(true);
      return <>
        <button type="button">Pembuka</button>
        <input aria-label="Lain" />
        {open && <Sheet open onClose={() => setOpen(false)} title="Menu" history={false}><button type="button" onClick={() => setOpen(false)}>Tutup menu</button></Sheet>}
        <button type="button" onClick={() => setOpen(false)}>Tutup dari luar</button>
      </>;
    }
    render(<Row />);
    const other = screen.getByRole("textbox", { name: "Lain", hidden: true });
    other.focus();
    fireEvent.click(screen.getByRole("button", { name: "Tutup dari luar", hidden: true }));
    expect(document.activeElement).toBe(other);
  });
});

describe("CSS for 320 px, zoom 200 % and desktop (the rules that hold the layout)", () => {
  const css = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

  it("Segmented: segments as wide as their words, labels wrap instead of '…', still 44 tall", () => {
    const text = css("./segmented.module.css");
    expect(text).toMatch(/\.item \{[^}]*flex: 1 1 auto/);
    expect(text).not.toMatch(/text-overflow: ellipsis/);
    expect(text).toMatch(/\.track \{[^}]*min-height: 44px/);
    expect(text).toMatch(/\.itemLabel \{[^}]*overflow-wrap: anywhere/);
  });

  it("SessionRow under 300 px: time on its own line, no rail, full-width title; a pill may wrap", () => {
    const text = css("./data.module.css");
    expect(text).toMatch(/@media \(max-width: 299\.98px\) \{[\s\S]*\.session \{ flex-wrap: wrap;[\s\S]*\.rail \{ display: none; \}[\s\S]*\.sessionBody \{ order: 2; flex: 1 1 100%; \}/);
    expect(css("./status.module.css")).toMatch(/\.pill \{[^}]*min-height: 26px; max-width: 100%/);
  });

  it("StackPreview wraps rather than pushing Lihat out of its card", () => {
    expect(css("./data.module.css")).toMatch(/\.peek \{[^}]*flex-wrap: wrap/);
  });

  it("sheets stay inside the column from 600 px (no panel at the window's edge)", () => {
    const text = css("./sheet.module.css");
    expect(text).toMatch(/@media \(min-width: 600px\) \{\s*\.sheet \{ width: min\(100%, var\(--mw-column\)\); margin: auto auto 0; \}/);
    expect(text).not.toMatch(/margin: 0 0 0 auto/);
  });

  it("the shell: skip link 44 tall, icon-only bottom bar under 240 px (words kept for screen readers)", () => {
    const text = readFileSync(join(process.cwd(), "src/components/main-wam/shell/shell.module.css"), "utf8");
    expect(text).toMatch(/\.skip \{[^}]*min-height: 44px/);
    expect(text).toMatch(/@media \(max-width: 239\.98px\) \{[\s\S]*\.label \{ position: absolute; width: 1px; height: 1px;/);
  });
});
