import { readFileSync } from "node:fs";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";
import { LoadingDialog } from "./LoadingDialog";
import { FilterChip } from "./Chip";
import { Segmented } from "./Segmented";
import { Sheet, useHashSheet } from "./Sheet";
import { ToastProvider, useToast, type ToastInput } from "./Toast";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

beforeAll(() => {
  // jsdom has no modal dialogs.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
beforeEach(() => { window.history.replaceState(null, "", "/wam2026"); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

function SheetHarness({ onClose, history, locked }: { onClose?: () => void; history?: boolean; locked?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)}>Ubah jam</button>
    <Sheet open={open} onClose={() => { onClose?.(); setOpen(false); }} title="Ubah jam sesi" subtitle="Team building" history={history} locked={locked}
      footer={<button type="button">Simpan</button>}>
      <input aria-label="Mulai" />
    </Sheet>
  </>;
}

describe("Sheet", () => {
  it("moves focus to its title on open and back to the opener on close (✕)", async () => {
    render(<SheetHarness />);
    const opener = screen.getByRole("button", { name: "Ubah jam" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Ubah jam sesi" });
    expect(dialog).toHaveProperty("open", true);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Ubah jam sesi" }));
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
    expect(screen.queryByRole("heading", { name: "Ubah jam sesi" })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("keeps Tab inside: from the last control to the first, and back with Shift+Tab", () => {
    render(<SheetHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Ubah jam" }));
    const dialog = screen.getByRole("dialog");
    const close = screen.getByRole("button", { name: "Tutup" });
    const save = screen.getByRole("button", { name: "Simpan" });
    save.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(save);
    // From the title (not a Tab stop), Shift+Tab goes to the last control.
    screen.getByRole("heading", { name: "Ubah jam sesi" }).focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(save);
  });

  it("closes on Esc, and its dialog's own close request", () => {
    const onClose = vi.fn();
    render(<SheetHarness onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Ubah jam" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Ubah jam" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("closes on a tap on the dimmed page, not on a tap inside", () => {
    const onClose = vi.fn();
    render(<SheetHarness onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Ubah jam" }));
    fireEvent.click(screen.getByRole("textbox", { name: "Mulai" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("owns a history entry while open: Back closes it, closing takes the entry back", async () => {
    const onClose = vi.fn();
    render(<SheetHarness onClose={onClose} />);
    const before = window.history.length;
    fireEvent.click(screen.getByRole("button", { name: "Ubah jam" }));
    expect(window.history.length).toBe(before + 1);
    expect(window.history.state?.mwSheet).toBeTruthy();
    act(() => { window.history.back(); });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("heading", { name: "Ubah jam sesi" })).toBeNull();

    // Closed with ✕: our entry is taken back, so the next Back leaves the screen as usual.
    fireEvent.click(screen.getByRole("button", { name: "Ubah jam" }));
    expect(window.history.state?.mwSheet).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
    await waitFor(() => expect(window.history.state?.mwSheet).toBeUndefined());
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("stays open while locked (busy): Esc and ✕ wait", () => {
    const onClose = vi.fn();
    render(<SheetHarness onClose={onClose} locked history={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Ubah jam" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("button", { name: "Tutup" })).toHaveProperty("disabled", true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("useHashSheet opens on #id, and Back (or close) removes it", async () => {
    function HashHarness() {
      const sheet = useHashSheet("ubah-jam");
      return <>
        <button type="button" onClick={sheet.show}>Buka</button>
        <Sheet open={sheet.open} onClose={sheet.close} history={false} title="Lewat alamat"><p>Isi</p></Sheet>
      </>;
    }
    render(<HashHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Buka" }));
    expect(window.location.hash).toBe("#ubah-jam");
    expect(screen.getByRole("heading", { name: "Lewat alamat" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
    await waitFor(() => expect(window.location.hash).toBe(""));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Lewat alamat" })).toBeNull());
  });
});

describe("ConfirmDialog", () => {
  it("starts on Batal, names the action by its result, and Esc cancels", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmDialog open tone="danger" title="Hapus foto ini?" body="Foto hilang dari Momen." confirmLabel="Hapus foto" onCancel={onCancel} onConfirm={onConfirm} history={false} />);
    const dialog = screen.getByRole("alertdialog", { name: "Hapus foto ini?" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Batal" }));
    fireEvent.click(screen.getByRole("button", { name: "Hapus foto" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

function ToastTrigger({ toast }: { toast: ToastInput }) {
  const api = useToast();
  return <button type="button" onClick={() => api.show(toast)}>Kirim</button>;
}
function ToastHarness({ toast }: { toast: ToastInput }) {
  return <ToastProvider><ToastTrigger toast={toast} /></ToastProvider>;
}

describe("Toast", () => {
  it("disappears after its time (4 s plain), and is read out politely", () => {
    vi.useFakeTimers();
    render(<ToastHarness toast={{ text: "Absen tercatat · 07.55", tone: "success" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    expect(screen.getByRole("status").textContent).toContain("Absen tercatat · 07.55");
    act(() => { vi.advanceTimersByTime(3999); });
    expect(screen.queryByText("Absen tercatat · 07.55")).not.toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByText("Absen tercatat · 07.55")).toBeNull();
  });

  it("Terkirim · Batalkan: the action undoes within 5 s and never times out after", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    const onTimeout = vi.fn();
    render(<ToastHarness toast={{ text: "Terkirim", timer: true, duration: 5000, action: { label: "Batalkan", onAction }, onTimeout }} />);
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    act(() => { vi.advanceTimersByTime(3000); });
    fireEvent.click(screen.getByRole("button", { name: "Batalkan" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Terkirim")).toBeNull();
    act(() => { vi.advanceTimersByTime(10000); });
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("two actions (Lihat, Batalkan): each runs once, closes the toast, and neither counts as a time out", () => {
    vi.useFakeTimers();
    const see = vi.fn(), undo = vi.fn(), onTimeout = vi.fn();
    render(<ToastHarness toast={{ text: "Terkirim ke semua peserta", sub: "Sesi: Team building", timer: true, duration: 5000, action: { label: "Batalkan", onAction: undo }, secondary: { label: "Lihat", onAction: see }, onTimeout }} />);
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    expect(screen.getByText("Sesi: Team building")).toBeTruthy();
    expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual(["Kirim", "Lihat", "Batalkan"]);
    fireEvent.click(screen.getByRole("button", { name: "Lihat" }));
    expect(see).toHaveBeenCalledTimes(1);
    expect(undo).not.toHaveBeenCalled();
    expect(screen.queryByText("Terkirim ke semua peserta")).toBeNull();
    act(() => { vi.advanceTimersByTime(10000); });
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("commits on time out when nobody pressed the action", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    const onTimeout = vi.fn();
    render(<ToastHarness toast={{ text: "Terkirim", timer: true, duration: 5000, action: { label: "Batalkan", onAction }, onTimeout }} />);
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Batalkan" })).toBeNull();
  });

  it("pauses while touched or focused, then finishes the time that was left", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    render(<ToastHarness toast={{ text: "Terkirim", duration: 5000, action: { label: "Batalkan", onAction: () => {} }, onTimeout }} />);
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    act(() => { vi.advanceTimersByTime(2000); });
    const action = screen.getByRole("button", { name: "Batalkan" });
    fireEvent.focus(action);
    act(() => { vi.advanceTimersByTime(20000); });
    expect(onTimeout).not.toHaveBeenCalled();
    fireEvent.blur(action);
    act(() => { vi.advanceTimersByTime(2999); });
    expect(onTimeout).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("uses 6 s by default with an action, and errors go to an alert region", () => {
    vi.useFakeTimers();
    render(<ToastHarness toast={{ text: "Foto belum terkirim", tone: "error", action: { label: "Coba lagi", onAction: () => {} } }} />);
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    expect(screen.getByRole("alert").textContent).toContain("Foto belum terkirim");
    act(() => { vi.advanceTimersByTime(5999); });
    expect(screen.queryByText("Foto belum terkirim")).not.toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByText("Foto belum terkirim")).toBeNull();
  });
});

describe("Segmented", () => {
  function SegmentedHarness({ onChange }: { onChange?: (value: string) => void }) {
    const [value, setValue] = useState<"semua" | "kelompok" | "saya">("semua");
    return <Segmented label="Tampilkan foto" value={value} onChange={next => { onChange?.(next); setValue(next); }}
      options={[{ value: "semua", label: "Semua" }, { value: "kelompok", label: "Kelompokku" }, { value: "saya", label: "Fotoku" }]} />;
  }

  it("is a radio group with one Tab stop on the chosen segment", () => {
    render(<SegmentedHarness />);
    expect(screen.getByRole("radiogroup", { name: "Tampilkan foto" })).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios.map(radio => radio.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
  });

  it("arrow keys move and choose, wrap around, Home and End go to the ends", () => {
    const onChange = vi.fn();
    render(<SegmentedHarness onChange={onChange} />);
    const radio = (name: string) => screen.getByRole("radio", { name });
    radio("Semua").focus();
    fireEvent.keyDown(radio("Semua"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(radio("Kelompokku"));
    expect(radio("Kelompokku").getAttribute("aria-checked")).toBe("true");
    expect(radio("Kelompokku").getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(radio("Kelompokku"), { key: "End" });
    expect(document.activeElement).toBe(radio("Fotoku"));
    fireEvent.keyDown(radio("Fotoku"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(radio("Semua"));
    fireEvent.keyDown(radio("Semua"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(radio("Fotoku"));
    fireEvent.keyDown(radio("Fotoku"), { key: "Home" });
    expect(radio("Semua").getAttribute("aria-checked")).toBe("true");
    expect(onChange.mock.calls.map(call => call[0])).toEqual(["kelompok", "saya", "semua", "saya", "semua"]);
  });

  it("skips a disabled segment and a click chooses", () => {
    const onChange = vi.fn();
    render(<Segmented label="Tujuan" value="kelompok" onChange={onChange}
      options={[{ value: "kelompok", label: "Kelompokku" }, { value: "x", label: "Nonaktif", disabled: true }, { value: "semua", label: "Semua" }]} />);
    const first = screen.getByRole("radio", { name: "Kelompokku" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith("semua");
    fireEvent.click(screen.getByRole("radio", { name: "Semua" }));
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe("FilterChip", () => {
  it("toggles a filter with aria-pressed and a check when on", () => {
    function Harness() {
      const [on, setOn] = useState(false);
      return <FilterChip selected={on} onClick={() => setOn(value => !value)}>Kelompok 1</FilterChip>;
    }
    render(<Harness />);
    const chip = screen.getByRole("button", { name: "Kelompok 1" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(chip.querySelector("svg")).toBeNull();
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(chip.querySelector("svg")).not.toBeNull();
  });

  it("as a menu ▾: opens a dialog, says the name and the whole value, no aria-pressed", () => {
    const onClick = vi.fn();
    render(<FilterChip menu name="Sesi" expanded={false} onClick={onClick}>Pemaparan departemen</FilterChip>);
    const chip = screen.getByRole("button", { name: "Sesi: Pemaparan departemen" });
    expect(chip.getAttribute("aria-haspopup")).toBe("dialog");
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    expect(chip.hasAttribute("aria-pressed")).toBe(false);
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does nothing when disabled", () => {
    const onClick = vi.fn();
    render(<FilterChip selected={false} disabled onClick={onClick}>Kelompok 9</FilterChip>);
    fireEvent.click(screen.getByRole("button", { name: "Kelompok 9" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("TextField and DayTabs", () => {
  it("ties label, help and error to the field, and counts characters", async () => {
    const { TextField } = await import("./Form");
    function Harness() {
      const [value, setValue] = useState("Halo");
      return <TextField multiline label="Masukan" help="Tanpa nama." error={value.length > 5 ? "Terlalu panjang" : undefined} value={value}
        onChange={event => setValue(event.target.value)} countMax={5} showCount />;
    }
    render(<Harness />);
    const field = screen.getByRole("textbox", { name: "Masukan" });
    expect(field.getAttribute("aria-invalid")).toBeNull();
    expect(document.getElementById(field.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Tanpa nama.");
    expect(screen.getByText("4/5")).toBeTruthy();
    fireEvent.change(field, { target: { value: "Halo semua" } });
    expect(field.getAttribute("aria-invalid")).toBe("true");
    const described = (field.getAttribute("aria-describedby") ?? "").split(" ").map(id => document.getElementById(id)?.textContent);
    expect(described).toEqual(["Terlalu panjang", "Tanpa nama."]);
    expect((field as HTMLTextAreaElement).value).toBe("Halo semua");
  });

  it("marks the chosen day and says today", async () => {
    const { DayTabs } = await import("./Form");
    const onSelect = vi.fn();
    render(<DayTabs current="1" onSelect={onSelect} days={[{ key: "1", day: "Hari 1", date: "Sen, 4 Jan" }, { key: "2", day: "Hari 2", date: "Sel, 5 Jan", today: true }]} />);
    expect(screen.getByRole("button", { name: /Hari 1/ }).getAttribute("aria-pressed")).toBe("true");
    const today = screen.getByRole("button", { name: /hari ini/ });
    expect(today.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(today);
    expect(onSelect).toHaveBeenCalledWith("2");
  });
});

/* ---------- Focus rings, button labels, progress labels (CSS read as text: jsdom has no cascade) ---------- */

const cssText = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
/** The declarations of the rule whose selector list contains `selector` exactly. */
function rule(file: string, selector: string): string {
  for (const match of cssText(file).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    // Commas at the top level only (not those inside :is(…)).
    if (match[1].split(/,(?![^(]*\))/).map(part => part.trim()).includes(selector)) return match[2];
  }
  throw new Error(`${selector} not in ${file}`);
}
/** Specificity [ids, classes, elements] of one simple selector chain (enough for the kit's rules). */
function specificity(selector: string): [number, number, number] {
  let rest = selector;
  let total: [number, number, number] = [0, 0, 0];
  const add = (other: [number, number, number]) => { total = [total[0] + other[0], total[1] + other[1], total[2] + other[2]]; };
  rest = rest.replace(/:(is|not|has)\(([^()]*)\)/g, (_, _kind, args: string) => {
    const best = args.split(",").map(arg => specificity(arg.trim())).sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])[0];
    add(best);
    return "";
  }).replace(/:where\([^()]*\)/g, "");
  add([(rest.match(/#[\w-]+/g) ?? []).length, (rest.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) ?? []).length,
    (rest.replace(/\[[^\]]+\]|::?[\w-]+|[.#][\w-]+/g, " ").match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length]);
  return total;
}
const beats = (a: [number, number, number], b: [number, number, number]) => a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])));
const THEME_RING = specificity(".root :focus-visible");

describe("Kit fixes: focus rings", () => {
  it("a text field has one ring: the box draws it, the control none (theme outline beaten)", async () => {
    const { TextField } = await import("./Form");
    const formCss = (await import("./form.module.css")).default;
    render(<TextField label="Judul" />);
    const input = screen.getByRole("textbox", { name: "Judul" });
    // `.box > .control` applies: the control sits right in the box.
    expect(input.className).toContain(formCss.control);
    expect(input.parentElement!.className).toContain(formCss.box);
    expect(rule("./form.module.css", ".box > .control:focus-visible")).toMatch(/outline:\s*none/);
    expect(beats(specificity(".box > .control:focus-visible"), THEME_RING)).toBe(true);
    expect(rule("./form.module.css", ".box:focus-within")).toMatch(/inset 0 0 0 2px var\(--mw-primary\)/);
    // The select field (a button that is the box) also keeps one ring.
    expect(rule("./form.module.css", ".box.select:focus-visible")).toMatch(/outline:\s*none/);
    expect(beats(specificity(".box.select:focus-visible"), THEME_RING)).toBe(true);
  });

  it("an error field still shows focus (the red line alone would look the same)", () => {
    const idle = rule("./form.module.css", ".boxError");
    const focused = rule("./form.module.css", ".boxError:focus-within");
    expect(focused).not.toBe(idle);
    expect(focused).toMatch(/var\(--mw-error\)/);
  });

  it("focus moved by script: headings (tabindex -1) and quiet focus draw no ring; everything else keeps it", () => {
    const heading = '.root :is(h1, h2, h3, h4, h5, h6, main)[tabindex="-1"]:focus';
    expect(rule("../theme/theme.module.css", heading)).toMatch(/outline:\s*none/);
    expect(beats(specificity(heading), THEME_RING)).toBe(true);
    expect(rule("../theme/theme.module.css", ".root [data-mw-quiet-focus]:focus-visible")).toMatch(/outline:\s*none/);
    expect(beats(specificity(".root [data-mw-quiet-focus]:focus-visible"), THEME_RING)).toBe(true);
    expect(rule("../theme/theme.module.css", ".root :focus-visible")).toMatch(/outline:\s*2px solid var\(--mw-focus\)/);
  });

  it("the sheet title is a script focus target (tabindex -1), so the heading rule covers it", () => {
    render(<Sheet open onClose={() => {}} title="Ubah jam" history={false}><p>Isi</p></Sheet>);
    const title = screen.getByRole("heading", { name: "Ubah jam" });
    expect(title.tagName).toBe("H2");
    expect(title.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(title);
  });
});

describe("Kit fixes: ConfirmDialog Batal", () => {
  it("is a text button (no line), as in the prototype (T01-buang, P05-keluar)", async () => {
    const buttonCss = (await import("./button.module.css")).default;
    render(<ConfirmDialog open tone="danger" title="Keluar dari WAM?" confirmLabel="Keluar" onCancel={() => {}} onConfirm={() => {}} history={false} />);
    const cancel = screen.getByRole("button", { name: "Batal" });
    expect(cancel.className).toContain(buttonCss.text);
    expect(cancel.className).not.toContain(buttonCss.secondary);
    expect(rule("./button.module.css", ".text")).not.toMatch(/box-shadow|border:/);
  });
});

describe("Kit fixes: button labels are never cut", () => {
  it("the label wraps (two lines, the button grows) instead of being clipped", async () => {
    const { Button } = await import("./Button");
    const buttonCss = (await import("./button.module.css")).default;
    render(<div style={{ width: 120 }}><Button variant="secondary" size="m">Tampilkan lagi</Button></div>);
    const button = screen.getByRole("button", { name: "Tampilkan lagi" });
    expect(button.className).toContain(buttonCss.m);
    const label = button.querySelector(`.${buttonCss.label}`)!;
    expect(label.textContent).toBe("Tampilkan lagi");
    const labelRule = rule("./button.module.css", ".label");
    expect(labelRule).not.toMatch(/overflow:\s*hidden|text-overflow|white-space:\s*nowrap/);
    expect(labelRule).toMatch(/overflow-wrap:\s*break-word/);
    const btn = rule("./button.module.css", ".btn");
    expect(btn).not.toMatch(/white-space:\s*nowrap/);
    expect(btn).not.toMatch(/(^|[\s;])height:\s*52px/);
    expect(btn).toMatch(/min-height:\s*52px/);
    expect(btn).toMatch(/height:\s*fit-content/);
  });

  it("M keeps a 44 touch area: 40 high at least, plus 2 above and below", () => {
    expect(rule("./button.module.css", ".m")).toMatch(/min-height:\s*40px/);
    const after = rule("./button.module.css", ".m::after");
    expect(after).toMatch(/top:\s*-2px/);
    expect(after).toMatch(/bottom:\s*-2px/);
  });
});

describe("Kit fixes: ProgressBar label size", () => {
  it("Label 13 by default; labelSize=subtitle puts label and value in Subtitle 17 (M06)", async () => {
    const { ProgressBar } = await import("./Data");
    const dataCss = (await import("./data.module.css")).default;
    const { rerender } = render(<ProgressBar label="312 dari 600 foto" value={312} max={600} valueText="52%" />);
    const box = () => screen.getByRole("progressbar", { name: "312 dari 600 foto" }).parentElement!;
    expect(box().className).not.toContain(dataCss.progressSubtitle);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe("52%");
    rerender(<ProgressBar label="312 dari 600 foto" value={312} max={600} valueText="52%" labelSize="subtitle" />);
    expect(box().className).toContain(dataCss.progressSubtitle);
    expect(rule("./data.module.css", ".progressSubtitle .progressLabel")).toMatch(/var\(--mw-type-subtitle\)/);
    expect(rule("./data.module.css", ".progressSubtitle .progressValue")).toMatch(/var\(--mw-text-1\)/);
    expect(rule("./data.module.css", ".progressLabel")).toMatch(/var\(--mw-type-label\)/);
  });
});

describe("LoadingDialog", () => {
  const dialog = () => screen.getByTestId("loading-dialog") as HTMLDialogElement;

  it("is open while the wait goes on, and Esc (cancel) is refused", () => {
    render(<LoadingDialog open title="Sedang masuk" />);
    expect(dialog().open).toBe(true);
    const cancel = new Event("cancel", { cancelable: true });
    dialog().dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog().open).toBe(true);
  });

  it("opens again when the browser closed it anyway (a second Esc) while `open` is still true", () => {
    render(<LoadingDialog open title="Sedang masuk" />);
    dialog().removeAttribute("open");
    fireEvent(dialog(), new Event("close"));
    expect(dialog().open).toBe(true);
  });

  it("closes for good when `open` turns false", () => {
    const { rerender } = render(<LoadingDialog open title="Sedang masuk" />);
    rerender(<LoadingDialog open={false} title="Sedang masuk" />);
    fireEvent(dialog(), new Event("close"));
    expect(dialog().open).toBe(false);
  });
});
