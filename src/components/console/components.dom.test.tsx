import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Card, ListRow, PersonCard, RowList, StatCard, StatRow } from "./Cards";
import { DayTimeline, hourLabel } from "./DayTimeline";
import { PageHeader } from "./PageHeader";
import { PageTabs } from "./PageTabs";
import { Avatar, RolePills, initials } from "./Pill";
import { FilterChips, SectionToolbar, ViewToggle } from "./SectionToolbar";
import { useViewPreference } from "./storage";

afterEach(() => { cleanup(); window.localStorage.clear(); });

describe("PageHeader and PageTabs", () => {
  it("writes the breadcrumb with links and the current page last, the title, and the actions", () => {
    render(<PageHeader crumbs={[{ label: "Admin WAM", href: "/admin/wam" }, "Orang", "Akun dan peran"]} title="Akun dan peran" subtitle="Buat akun dan atur peran." actions={<button type="button">Buat akun</button>} />);
    const crumbs = screen.getByRole("navigation", { name: "Lokasi halaman" });
    expect(within(crumbs).getByRole("link", { name: "Admin WAM" }).getAttribute("href")).toBe("/admin/wam");
    expect(within(crumbs).getByText("Akun dan peran").getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Akun dan peran");
    expect(screen.getByRole("button", { name: "Buat akun" })).toBeTruthy();
  });

  it("marks the current tab and gives its badge words", () => {
    render(<PageTabs label="Bagian akun" current="akun" tabs={[
      { key: "akun", label: "Akun", href: "/akun" }, { key: "peran", label: "Peran", href: "/akun/peran" }, { key: "reset", label: "Permintaan reset", href: "/reset", badge: "2" },
    ]} />);
    const tabs = within(screen.getByRole("navigation", { name: "Bagian akun" })).getAllByRole("link");
    expect(tabs.map(tab => tab.getAttribute("aria-current"))).toEqual(["page", null, null]);
    expect(tabs[2].textContent).toBe("Permintaan reset2 menunggu");
  });
});

describe("toolbar controls", () => {
  it("names the search, shows the count, and switches Kartu and Tabel", () => {
    const onSearch = vi.fn();
    const onView = vi.fn();
    render(<SectionToolbar title="Akun" count="48 orang" search={{ label: "Cari akun", placeholder: "Cari nama atau email", onChange: onSearch }} view={<ViewToggle value="kartu" onChange={onView} />} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Akun");
    expect(screen.getByText("48 orang")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Cari akun" }), { target: { value: "dewi" } });
    expect(onSearch).toHaveBeenCalledWith("dewi");
    const view = screen.getByRole("group", { name: "Tampilan" });
    expect(within(view).getByRole("button", { name: "Kartu" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(view).getByRole("button", { name: "Tabel" }));
    expect(onView).toHaveBeenCalledWith("tabel");
  });

  it("uses links for chips with an address, the chosen one marked", () => {
    render(<FilterChips label="Peran" value="bod" chips={[{ value: "semua", label: "Semua", count: 48, href: "?" }, { value: "bod", label: "BOD", count: 5, href: "?peran=bod" }]} />);
    const chips = within(screen.getByRole("group", { name: "Peran" })).getAllByRole("link");
    expect(chips.map(chip => chip.getAttribute("aria-current"))).toEqual([null, "true"]);
    expect(chips[1].textContent).toBe("BOD5");
  });

  it("remembers Kartu or Tabel per page", () => {
    function Probe() { const [view, setView] = useViewPreference("test-page"); return <ViewToggle value={view} onChange={setView} />; }
    const { unmount } = render(<Probe />);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Tabel" })); });
    expect(screen.getByRole("button", { name: "Tabel" }).getAttribute("aria-pressed")).toBe("true");
    unmount();
    render(<Probe />);
    expect(screen.getByRole("button", { name: "Tabel" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("pills and people", () => {
  it("shows the first role and a +N pill that names the rest", () => {
    const { container } = render(<RolePills roles={["Panitia", "Admin WAM", "BOD"]} />);
    expect(container.textContent).toBe("Panitia+2dan 2 peran lain: Admin WAM, BOD");
    expect(container.querySelector("[title='Admin WAM, BOD']")).toBeTruthy();
    cleanup();
    expect(render(<RolePills roles={[]} />).container.textContent).toBe("—");
  });

  it("writes initials when there is no photo", () => {
    expect(initials("Dewi Lestari")).toBe("DL");
    expect(initials("Andi")).toBe("AN");
    expect(initials("Raden Mas Budi")).toBe("RB");
    expect(render(<Avatar name="Dewi Lestari" />).container.textContent).toBe("DL");
  });

  it("makes the whole person card one link with name, status, unit, roles and email", () => {
    render(<PersonCard name="Dewi Lestari" job="HR Officer" status={{ label: "Aktif", tone: "ok" }} unit="Human Capital" roles={["Admin WAM", "Peserta"]} email="dewi@werkudara.com" meta="Terakhir masuk: 3 Nov" href="/orang/dewi" />);
    const card = screen.getByRole("link");
    expect(card.getAttribute("href")).toBe("/orang/dewi");
    for (const text of ["Dewi Lestari", "HR Officer", "Aktif", "Human Capital", "Admin WAM", "dewi@werkudara.com", "Terakhir masuk: 3 Nov"]) expect(card.textContent).toContain(text);
  });

  it("lays out stat cards and list rows as lists", () => {
    render(<>
      <StatRow label="Angka"><StatCard label="Akun aktif" value="42" note="dari 48" tone="ok" /><StatCard label="Reset menunggu" value="2" href="/reset" /></StatRow>
      <Card title="Perlu tindakan" action={{ label: "Lihat semua", href: "/semua" }}><RowList><ListRow title="2 permintaan reset" sub="Sejak kemarin" href="/reset" trailing={<span>Buka</span>} /></RowList></Card>
    </>);
    expect(within(screen.getByRole("list", { name: "Angka" })).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Reset menunggu/ }).getAttribute("href")).toBe("/reset");
    expect(screen.getByRole("heading", { name: "Perlu tindakan" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Lihat semua" }).getAttribute("href")).toBe("/semua");
  });
});

describe("DayTimeline", () => {
  it("places blocks by their hours, writes the times for screen readers, and hides the line of a short block", () => {
    const { container } = render(<DayTimeline title="Jadwal hari ini" from={9} to={18} now={13.5} range={{ value: "hari", hrefs: { hari: "?r=hari", minggu: "?r=minggu" } }} rows={[
      { key: "a", label: "Antareja", sub: "4 kursi", blocks: [{ key: "b1", title: "Appraisal Dewi", sub: "HR", start: 9.5, end: 11, tone: "teal" }, { key: "b2", title: "Singkat", sub: "Tidak tampil", start: 13, end: 13.5 }] },
      { key: "b", label: "Nagapadma", blocks: [{ key: "x", title: "Di luar jam", start: 6, end: 8 }] },
    ]} />);
    expect(hourLabel(9.5)).toBe("09.30");
    expect(hourLabel(17.999)).toBe("18.00");
    const first = within(screen.getByRole("list", { name: "Antareja" })).getAllByRole("listitem");
    expect(first).toHaveLength(2);
    expect(first[0].textContent).toBe("Appraisal Dewi, 09.30–11.00HR");
    const block = first[0].firstElementChild as HTMLElement;
    expect(block.style.left).toBe(`${(0.5 / 9) * 100}%`);
    expect(block.getAttribute("data-tone")).toBe("teal");
    expect((first[1].firstElementChild as HTMLElement).getAttribute("data-narrow")).toBe("true");
    // A block outside the hours is left out; the row says it is empty.
    expect(screen.getByRole("list", { name: "Nagapadma: kosong" }).children).toHaveLength(0);
    expect(screen.getByText("Sekarang pukul 13.30")).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Rentang" })).getByRole("link", { name: "Hari" }).getAttribute("aria-current")).toBe("true");
    expect(container.textContent).toContain("09.00");
    expect(container.textContent).toContain("18.00");
  });

  it("says so when there is nothing", () => {
    render(<DayTimeline title="Jadwal hari ini" rows={[]} empty="Belum ada booking hari ini." />);
    expect(screen.getByText("Belum ada booking hari ini.")).toBeTruthy();
  });
});
