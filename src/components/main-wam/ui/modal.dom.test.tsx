import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";
import { Sheet } from "./Sheet";
import { QUIET_FOCUS } from "./useModal";

/*
 * Modals and history (useModal): one entry per open modal, chained modals, Back, and focus.
 * jsdom moves through history asynchronously (two timer hops), as browsers do, so the old bug shows
 * here: history.back() of the first modal landed after the second one opened and closed it.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/wam2026" }));

beforeAll(() => {
  // jsdom has no modal dialogs.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

/** Lets history steps (and the kit's take-back timer) finish. */
const settle = (ms = 40) => act(() => new Promise<void>(resolve => { window.setTimeout(resolve, ms); }));
const marker = () => (window.history.state as { marker?: string } | null)?.marker;
const sheetKey = () => (window.history.state as { mwSheet?: string } | null)?.mwSheet;
const isOpen = (name: string) => !!screen.queryByRole("heading", { name });

beforeEach(async () => {
  // A page entry before ours, so a leaked entry shows: one Back from "base" must reach "previous".
  window.history.replaceState({ marker: "previous" }, "", "/wam2026");
  window.history.pushState({ marker: "base" }, "", "/wam2026");
  await settle(5);
});
afterEach(async () => { cleanup(); await settle(); vi.useRealTimers(); });

/** Back from "base" lands on "previous": nothing of ours is left in between. */
async function expectClean() {
  expect(sheetKey()).toBeUndefined();
  expect(marker()).toBe("base");
  act(() => { window.history.back(); });
  await settle();
  expect(marker()).toBe("previous");
}

type When = "same" | "next" | "later" | "during";
/**
 * Menu (a sheet) → Pindah tempat: closes the menu and opens the next one, as RundownLive does.
 * `nextFirst` puts the second modal before the first in the tree, so its effects run first.
 */
function Chain({ when, second, nextFirst }: { when: When; second: "sheet" | "dialog"; nextFirst?: boolean }) {
  const [open, setOpen] = useState<"menu" | "next" | null>(null);
  const go = () => {
    setOpen(null);
    if (when === "same") setOpen("next");
    else if (when !== "during") window.setTimeout(() => setOpen("next"), when === "next" ? 0 : 3);
  };
  const next = second === "sheet"
    ? <Sheet key="next" open={open === "next"} onClose={() => setOpen(null)} title="Pindah tempat"><p>Isi</p></Sheet>
    : <ConfirmDialog key="next" open={open === "next"} onCancel={() => setOpen(null)} onConfirm={() => setOpen(null)} title="Pindah tempat?" confirmLabel="Pindahkan" />;
  const menu = <Sheet key="menu" open={open === "menu"} onClose={() => setOpen(null)} title="Menu sesi">
    <button type="button" onClick={go}>Pindah tempat</button>
  </Sheet>;
  return <>
    <button type="button" onClick={() => setOpen("menu")}>Buka menu</button>
    <button type="button" onClick={() => setOpen("next")}>Buka berikutnya</button>
    {nextFirst ? <>{next}{menu}</> : <>{menu}{next}</>}
  </>;
}

describe("Modal history: one modal straight to the next", () => {
  for (const when of ["same", "next", "later"] as const) {
    for (const second of ["sheet", "dialog"] as const) {
      for (const nextFirst of [false, true]) {
        it(`closing the menu and opening a ${second} (${when} tick${nextFirst ? ", second earlier in the tree" : ""}) keeps it open; Back closes it; no entry left`, async () => {
          render(<Chain when={when} second={second} nextFirst={nextFirst} />);
          fireEvent.click(screen.getByRole("button", { name: "Buka menu" }));
          expect(sheetKey()).toBeTruthy();
          fireEvent.click(screen.getByRole("button", { name: "Pindah tempat" }));
          await settle();
          const title = second === "sheet" ? "Pindah tempat" : "Pindah tempat?";
          expect(isOpen("Menu sesi")).toBe(false);
          expect(isOpen(title)).toBe(true);
          expect(sheetKey()).toBeTruthy();
          // The phone's Back closes it, and only it.
          act(() => { window.history.back(); });
          await settle();
          expect(isOpen(title)).toBe(false);
          await expectClean();
        });
      }
    }
  }

  it("a modal opened while the first one's history step is on its way waits for it, then stays open", async () => {
    render(<Chain when="during" second="sheet" />);
    // Open the next one the moment the kit steps back (before the browser answers with popstate).
    const openNext = () => fireEvent.click(screen.getByRole("button", { name: "Buka berikutnya", hidden: true }));
    const realGo = History.prototype.go.bind(window.history);
    const realBack = History.prototype.back.bind(window.history);
    const go = vi.spyOn(window.history, "go").mockImplementation((delta?: number) => { realGo(delta); openNext(); });
    const back = vi.spyOn(window.history, "back").mockImplementation(() => { realBack(); openNext(); });
    fireEvent.click(screen.getByRole("button", { name: "Buka menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Pindah tempat" }));
    await settle();
    go.mockRestore();
    back.mockRestore();
    expect(isOpen("Pindah tempat")).toBe(true);
    expect(sheetKey()).toBeTruthy();
    act(() => { window.history.back(); });
    await settle();
    expect(isOpen("Pindah tempat")).toBe(false);
    await expectClean();
  });

  it("closing the second one with its own button takes its entry back too", async () => {
    render(<Chain when="same" second="dialog" />);
    fireEvent.click(screen.getByRole("button", { name: "Buka menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Pindah tempat" }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    await settle();
    expect(isOpen("Pindah tempat?")).toBe(false);
    await expectClean();
  });
});

describe("Modal history: stacked modals and Back", () => {
  function Stacked({ busy }: { busy?: boolean }) {
    const [sheet, setSheet] = useState(false);
    const [dialog, setDialog] = useState(false);
    return <>
      <button type="button" onClick={() => setSheet(true)}>Buka</button>
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Detail foto">
        <button type="button" onClick={() => setDialog(true)}>Hapus</button>
      </Sheet>
      <ConfirmDialog open={dialog} busy={busy} onCancel={() => setDialog(false)} onConfirm={() => { setDialog(false); setSheet(false); }}
        title="Hapus foto ini?" confirmLabel="Hapus foto" tone="danger" />
    </>;
  }

  it("Back closes the top one only, then the one under it", async () => {
    render(<Stacked />);
    fireEvent.click(screen.getByRole("button", { name: "Buka" }));
    fireEvent.click(screen.getByRole("button", { name: "Hapus" }));
    await settle();
    act(() => { window.history.back(); });
    await settle();
    expect(isOpen("Hapus foto ini?")).toBe(false);
    expect(isOpen("Detail foto")).toBe(true);
    act(() => { window.history.back(); });
    await settle();
    expect(isOpen("Detail foto")).toBe(false);
    await expectClean();
  });

  it("an action that closes both takes both entries back in one go", async () => {
    render(<Stacked />);
    fireEvent.click(screen.getByRole("button", { name: "Buka" }));
    fireEvent.click(screen.getByRole("button", { name: "Hapus" }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Hapus foto" }));
    await settle();
    expect(isOpen("Detail foto")).toBe(false);
    await expectClean();
  });

  it("busy: Back keeps it open and puts the entry back", async () => {
    render(<Stacked busy />);
    fireEvent.click(screen.getByRole("button", { name: "Buka" }));
    fireEvent.click(screen.getByRole("button", { name: "Hapus" }));
    await settle();
    act(() => { window.history.back(); });
    await settle();
    expect(isOpen("Hapus foto ini?")).toBe(true);
    expect(sheetKey()).toBeTruthy();
  });

  it("went to another page while a sheet was open: Back from there skips the sheet's old entry", async () => {
    function Page() {
      const [shown, setShown] = useState(true);
      return <>
        <button type="button" onClick={() => {
          // As next/link does: a new entry without our key, then the screen (and its sheet) goes.
          window.history.pushState({ marker: "page2" }, "", "/wam2026/agenda");
          setShown(false);
        }}>Agenda</button>
        {shown && <Sheet open onClose={() => {}} title="Sementara"><p>Isi</p></Sheet>}
      </>;
    }
    render(<Page />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Agenda", hidden: true }));
    await settle();
    expect(marker()).toBe("page2");
    act(() => { window.history.back(); });
    await settle(80);
    expect(marker()).toBe("base");
    await expectClean();
  });

  it("an entry of ours from before a reload is the page now: Back closes the sheet and stays there", async () => {
    window.history.replaceState({ marker: "base", mwSheet: "dari-sebelum-muat-ulang" }, "", "/wam2026");
    render(<Stacked />);
    fireEvent.click(screen.getByRole("button", { name: "Buka" }));
    act(() => { window.history.back(); });
    await settle(80);
    expect(isOpen("Detail foto")).toBe(false);
    expect(marker()).toBe("base");
    act(() => { window.history.back(); });
    await settle();
    expect(marker()).toBe("previous");
  });

  it("a modal removed while open takes its entry back", async () => {
    function Removable() {
      const [shown, setShown] = useState(true);
      return <>
        <button type="button" onClick={() => setShown(false)}>Pergi</button>
        {shown && <Sheet open onClose={() => {}} title="Sementara"><p>Isi</p></Sheet>}
      </>;
    }
    render(<Removable />);
    await settle();
    expect(sheetKey()).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pergi", hidden: true }));
    await settle();
    await expectClean();
  });
});

describe("Modal focus", () => {
  it("after a tap: focus lands on Batal without a ring (quiet), and a key press brings the ring back", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <>
        <button type="button" onClick={() => setOpen(true)}>Hapus</button>
        <ConfirmDialog open={open} onCancel={() => setOpen(false)} onConfirm={() => setOpen(false)} title="Hapus foto ini?" confirmLabel="Hapus foto" history={false} />
      </>;
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Hapus" });
    // A click as the browser does it: pointer down, focus, click.
    fireEvent.pointerDown(opener);
    opener.focus();
    fireEvent.click(opener);
    const cancel = screen.getByRole("button", { name: "Batal" });
    expect(document.activeElement).toBe(cancel);
    expect(cancel.hasAttribute(QUIET_FOCUS)).toBe(true);
    fireEvent.keyDown(cancel, { key: "Shift" });
    expect(cancel.hasAttribute(QUIET_FOCUS)).toBe(false);
    // Closed with a key: back on the opener, with its ring.
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(document.activeElement).toBe(opener);
    expect(opener.hasAttribute(QUIET_FOCUS)).toBe(false);
  });

  it("after a key press: focus lands on Batal with its ring", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <>
        <button type="button" onClick={() => setOpen(true)}>Hapus</button>
        <ConfirmDialog open={open} onCancel={() => setOpen(false)} onConfirm={() => setOpen(false)} title="Hapus foto ini?" confirmLabel="Hapus foto" history={false} />
      </>;
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Hapus" });
    opener.focus();
    fireEvent.keyDown(opener, { key: "Enter" });
    fireEvent.click(opener);
    const cancel = screen.getByRole("button", { name: "Batal" });
    expect(document.activeElement).toBe(cancel);
    expect(cancel.hasAttribute(QUIET_FOCUS)).toBe(false);
  });

  it("from one modal straight to the next: closing the second returns focus to the first one's opener", async () => {
    render(<Chain when="same" second="dialog" nextFirst />);
    const opener = screen.getByRole("button", { name: "Buka menu" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: "Pindah tempat" }));
    await settle();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Batal" }));
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(document.activeElement).toBe(opener);
  });

  it("the sheet title takes focus for screen readers and is not a Tab stop", () => {
    render(<Sheet open onClose={() => {}} title="Ubah jam" history={false}><p>Isi</p></Sheet>);
    const title = screen.getByRole("heading", { name: "Ubah jam" });
    expect(document.activeElement).toBe(title);
    expect(title.getAttribute("tabindex")).toBe("-1");
  });
});
