import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ConsoleShell } from "./ConsoleShell";
import { filterPalette } from "./CommandPalette";
import type { ConsoleNavGroup } from "./types";

beforeAll(() => {
  // jsdom has no modal dialogs; enough of one for the drawer and the palette.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); window.localStorage.clear(); });

const groups: ConsoleNavGroup[] = [
  { label: "Ikhtisar", items: [{ key: "home", label: "Ringkasan", href: "/a" }] },
  { label: "Jadwal", items: [{ key: "sesi", label: "Sesi", href: "/a/sesi" }, { key: "minta", label: "Permintaan jadwal", href: "/a/minta", badge: "3" }] },
];

function shell(extra: Partial<Parameters<typeof ConsoleShell>[0]> = {}) {
  return render(<ConsoleShell area="Kelola acara" theme="pw" person={{ name: "Dewi Lestari", sub: "HR" }} groups={groups} current="sesi"
    footerLinks={[{ label: "Kembali ke aplikasi", href: "/wam" }]} searchItems={[{ key: "p1", label: "Budi Santoso", sub: "Keuangan", href: "/a/orang/p1" }]} {...extra}>
    <p>Isi</p>
  </ConsoleShell>);
}

describe("ConsoleShell", () => {
  it("shows the identity, the groups, the current page and a count with words for screen readers", () => {
    shell();
    const menu = screen.getByRole("navigation", { name: "Menu Kelola acara" });
    expect(within(menu).getByRole("link", { name: "Sesi" }).getAttribute("aria-current")).toBe("page");
    expect(within(menu).getByRole("link", { name: /Permintaan jadwal/ }).textContent).toContain("3 menunggu");
    expect(screen.getByText("Dewi Lestari · HR")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Kembali ke aplikasi" }).getAttribute("href")).toBe("/wam");
    expect(screen.getByRole("main").textContent).toBe("Isi");
  });

  it("folds a group and opens it again", () => {
    shell();
    const head = screen.getByRole("button", { name: "Jadwal" });
    expect(head.getAttribute("aria-expanded")).toBe("true");
    act(() => { fireEvent.click(head); });
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(head.getAttribute("aria-controls")!)!.hidden).toBe(true);
    act(() => { fireEvent.click(head); });
    expect(head.getAttribute("aria-expanded")).toBe("true");
  });

  it("collapses to an icon rail and remembers it on this device", () => {
    const { container, unmount } = shell({ storageKey: "test" });
    const root = container.firstElementChild!;
    expect(root.getAttribute("data-collapsed")).toBe("false");
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Ciutkan menu" })); });
    expect(root.getAttribute("data-collapsed")).toBe("true");
    expect(window.localStorage.getItem("console-sidebar:test")).toBe("1");
    // The names stay for screen readers in the rail.
    expect(screen.getByRole("link", { name: "Sesi" })).toBeTruthy();
    unmount();
    const again = shell({ storageKey: "test" });
    expect(again.container.firstElementChild!.getAttribute("data-collapsed")).toBe("true");
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Lebarkan menu" })); });
    expect(window.localStorage.getItem("console-sidebar:test")).toBe("0");
  });

  it("opens the drawer from the phone bar, closes it with Esc, and returns focus", () => {
    const { container } = shell();
    const burger = screen.getByRole("button", { name: "Menu Kelola acara" });
    expect(burger.parentElement!.textContent).toContain("Sesi");
    act(() => { fireEvent.click(burger); });
    const drawer = container.querySelector("dialog[open]") as HTMLDialogElement;
    expect(within(drawer).getByRole("link", { name: "Sesi" }).getAttribute("aria-current")).toBe("page");
    act(() => { fireEvent(drawer, new Event("cancel", { cancelable: true })); });
    expect(burger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(burger);
  });

  it("opens the search with Ctrl K, filters menu and people, moves with arrows, opens with Enter, closes with Esc", () => {
    shell();
    const searchButton = screen.getAllByRole("button", { name: /Cari halaman atau orang/ })[0];
    searchButton.focus();
    act(() => { fireEvent.keyDown(window, { key: "k", ctrlKey: true }); });
    const input = screen.getByRole("combobox");
    expect(document.activeElement).toBe(input);
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["RingkasanIkhtisar", "SesiJadwal", "Permintaan jadwalJadwal", "Budi SantosoKeuangan", "Kembali ke aplikasi"]);

    act(() => { fireEvent.change(input, { target: { value: "jadwal" } }); });
    const options = screen.getAllByRole("option");
    expect(options.map(option => option.getAttribute("href"))).toEqual(["/a/sesi", "/a/minta"]);
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);
    act(() => { fireEvent.keyDown(input, { key: "ArrowDown" }); });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[1].id);
    expect(options[1].getAttribute("aria-selected")).toBe("true");

    let opened = "";
    options[1].addEventListener("click", event => { event.preventDefault(); opened = (event.currentTarget as HTMLAnchorElement).getAttribute("href")!; });
    act(() => { fireEvent.keyDown(input, { key: "Enter" }); });
    expect(opened).toBe("/a/minta");
    // Opening closes the palette; focus goes back to the search button.
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(document.activeElement).toBe(searchButton);

    act(() => { fireEvent.click(searchButton); });
    const dialog = screen.getByRole("combobox").closest("dialog")!;
    act(() => { fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzz" } }); });
    expect(screen.getByRole("status").textContent).toContain("zzz");
    act(() => { fireEvent(dialog, new Event("cancel", { cancelable: true })); });
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

describe("filterPalette", () => {
  const items = [
    { key: "4", label: "Data akun", href: "/4", sub: "HR" },
    { key: "1", label: "Akun dan peran", href: "/1", sub: "Orang" },
    { key: "2", label: "Ruang dan denah", href: "/2", sub: "Aplikasi" },
    { key: "3", label: "Rekap", href: "/3", sub: "Kuesioner" },
  ];
  it("matches every word, ignores case and accents, and puts names that start with it first", () => {
    expect(filterPalette(items, "").map(item => item.key)).toEqual(["4", "1", "2", "3"]);
    expect(filterPalette(items, "ORANG akun").map(item => item.key)).toEqual(["1"]);
    expect(filterPalette(items, "akun").map(item => item.key)).toEqual(["1", "4"]);
    expect(filterPalette(items, "ré").map(item => item.key)).toEqual(["3"]);
    expect(filterPalette(items, "tidak ada")).toEqual([]);
  });
});
