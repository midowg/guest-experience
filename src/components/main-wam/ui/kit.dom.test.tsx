import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";
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
beforeEach(() => { window.history.replaceState(null, "", "/wam/acara"); });
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
