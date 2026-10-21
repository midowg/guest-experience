import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { EventEditor } from "@/components/admin/editor/EventEditor";
import { editorMenu, menuButton, openBlock, otherBlocks } from "@/components/admin/editor/editor-test-helpers";

// The full editor is a large DOM; role queries over it outlast the 5 s default when the
// whole suite runs in parallel. The cost is in the queries, not in the behaviour under test.
vi.setConfig({ testTimeout: 20000 });

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const embedUrl = "https://www.google.com/maps/embed?pb=!1m18";

beforeEach(() => {
  refresh.mockClear();
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal("fetch", vi.fn(async (_url, init: RequestInit) => {
    const event = JSON.parse(init.body as string);
    return new Response(JSON.stringify({ ok: true, data: event, message: "Perubahan tersimpan." }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  window.scrollTo = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });


it("saves the PIC and chosen telephone channel", async () => {
  render(<EventEditor event={createSeedEvent()} />);
  openBlock("Kontak");
  fireEvent.change(screen.getByRole("textbox", { name: "Nama PIC" }), { target: { value: "Koordinator Acara" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Nomor PIC" }), { target: { value: "0812 3456 7890" } });
  fireEvent.click(screen.getByRole("radio", { name: "Telepon" }));
  fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
  const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(JSON.parse(init.body).contact).toEqual({ name: "Koordinator Acara", phone: "0812 3456 7890", channel: "phone", heading: "", description: "", role: "", organization: "", photo: { url: "", alt: "", srcset: [] }, staff_id: "" });
}, 10000);

it("flags incomplete PIC details without sending the event", () => {
  render(<EventEditor event={createSeedEvent()} />);
  openBlock("Kontak");
  fireEvent.change(screen.getByRole("textbox", { name: "Nama PIC" }), { target: { value: "Koordinator Acara" } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  expect(screen.getByRole("textbox", { name: "Nomor PIC" }).getAttribute("aria-invalid")).toBe("true");
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

it("requires an embed before saving the selected map mode", () => {
  render(<EventEditor event={createSeedEvent()} />);
  openBlock("Lokasi");
  fireEvent.click(screen.getByRole("radio", { name: "Peta sematan Google" }));
  fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  expect(screen.getByText("Isi kode sematan Google Maps.")).toBeTruthy();
  expect(screen.getByRole("textbox", { name: /Kode sematan Google Maps/ }).getAttribute("aria-invalid")).toBe("true");
  expect(screen.queryByRole("textbox", { name: "Tautan lokasi Maps" })).toBeNull();
  expect(screen.getByText(/Bagikan \(Share\).*Sematkan peta/)).toBeTruthy();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

it("saves only the Google URL from a pasted iframe and restores manual mode without erasing the pin", async () => {
  render(<EventEditor event={createSeedEvent()} />);
  openBlock("Lokasi");
  fireEvent.click(screen.getByRole("radio", { name: "Peta sematan Google" }));
  fireEvent.change(screen.getByRole("textbox", { name: /Kode sematan Google Maps/ }), { target: { value: `<iframe src="${embedUrl}" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>` } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
  const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(JSON.parse(init.body).location_embed_url).toBe(embedUrl);
  expect(JSON.parse(init.body).location_display).toBe("embed");
  await vi.waitFor(() => expect(screen.getByText("Perubahan tersimpan.")).toBeTruthy());

  openBlock("Lokasi");
  fireEvent.click(screen.getByRole("radio", { name: "Alamat & tombol" }));
  expect(screen.queryByRole("textbox", { name: /Kode sematan Google Maps/ })).toBeNull();
  expect(screen.getByRole("textbox", { name: "Tautan lokasi Maps" })).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "Petunjuk kedatangan (opsional)" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
  const [, manualInit] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
  const saved = JSON.parse(manualInit.body);
  expect(saved.location_embed_url).toBe(embedUrl);
  expect(saved.location_display).toBe("manual");
  expect(saved.location_url).toBe(createSeedEvent().location_url);
  await vi.waitFor(() => expect(screen.getByText("Perubahan tersimpan.")).toBeTruthy());
  openBlock("Lokasi");
  fireEvent.click(screen.getByRole("radio", { name: "Peta sematan Google" }));
  expect((screen.getByRole("textbox", { name: /Kode sematan Google Maps/ }) as HTMLTextAreaElement).value).toBe(embedUrl);
}, 20000);

it("lets the super admin save the event kind, audience, theme, and experience story", async () => {
  render(<EventEditor event={createSeedEvent()} superAdmin />);
  openBlock("Jenis, audiens, dan tampilan");
  fireEvent.click(screen.getByRole("radio", { name: /^Kunjungan/ }));
  fireEvent.click(screen.getByRole("radio", { name: /^Internal/ }));
  fireEvent.click(screen.getByRole("radio", { name: /^Malam Apresiasi/ }));
  openBlock("Pengalaman kunjungan");
  fireEvent.change(screen.getByRole("textbox", { name: "Cerita singkat" }), { target: { value: "Kami menyambut Anda seperti kerabat." } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
  const saved = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
  expect(saved).toMatchObject({ event_kind: "kunjungan", audience: "internal", theme: { key: "gala", corners: "square" } });
  expect(saved.experience.story).toBe("Kami menyambut Anda seperti kerabat.");
  await vi.waitFor(() => expect(screen.getByText("Perubahan tersimpan.")).toBeTruthy());
  openBlock("Setelah acara");
  expect(screen.getByText("Acara internal: ajakan kolaborasi dan ulasan Google tidak ditampilkan.")).toBeTruthy();
}, 10000);

it("opens on the basics, switches blocks from the menu, and marks unsaved changes", () => {
  render(<EventEditor event={createSeedEvent()} />);
  // A form is always on screen next to the phone preview; no cards, no dialog.
  expect(screen.getByRole("heading", { level: 2, name: "Identitas & undangan" })).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "Judul acara" })).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByTitle("Pratinjau undangan di ponsel")).toBeTruthy();
  // No completeness score: what an event needs differs from event to event.
  expect(screen.queryByText("Kesiapan tayang")).toBeNull();
  openBlock("Kontak");
  expect(screen.getByRole("heading", { level: 2, name: "Kontak" })).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "Judul acara" })).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Nama PIC" }), { target: { value: "Raja" } });
  expect(within(menuButton("Kontak")!).getByTitle("Belum disimpan")).toBeTruthy();
  expect(screen.getByText("Ada perubahan yang belum disimpan")).toBeTruthy();
});

it("switches between the form and the phone preview on a phone", () => {
  render(<EventEditor event={createSeedEvent()} />);
  const layout = screen.getByRole("textbox", { name: "Judul acara" }).closest("[data-view]")!;
  expect(layout.getAttribute("data-view")).toBe("form");
  fireEvent.click(screen.getByRole("button", { name: "Lihat" }));
  expect(layout.getAttribute("data-view")).toBe("preview");
  // ☰ opens the block menu as a drawer; picking a block closes it and shows that block's form.
  const toggle = screen.getByRole("button", { name: "Buka menu bagian" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(editorMenu().getAttribute("data-open")).not.toBeNull();
  openBlock("Lokasi");
  expect(editorMenu().getAttribute("data-open")).toBeNull();
  expect(layout.getAttribute("data-view")).toBe("form");
  expect(screen.getByRole("heading", { level: 2, name: "Lokasi" })).toBeTruthy();
});

it("closes the drawer with Escape or the backdrop", () => {
  render(<EventEditor event={createSeedEvent()} />);
  fireEvent.click(screen.getByRole("button", { name: "Buka menu bagian" }));
  fireEvent.keyDown(window, { key: "Escape" });
  expect(editorMenu().getAttribute("data-open")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Buka menu bagian" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Tutup menu" })[0]);
  expect(editorMenu().getAttribute("data-open")).toBeNull();
});

it("keeps deleting the event in the menu, away from the forms", () => {
  render(<EventEditor event={createSeedEvent()} dangerZone={<p>Isi hapus acara</p>} />);
  expect(screen.queryByText("Isi hapus acara")).toBeNull();
  openBlock("Hapus acara");
  expect(screen.getByRole("heading", { level: 2, name: "Hapus acara" })).toBeTruthy();
  expect(screen.getByText("Isi hapus acara")).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "Judul acara" })).toBeNull();
});

it("offers known greetings as chips that replace the text, with a way back to what was typed", () => {
  render(<EventEditor event={{ ...createSeedEvent(), greeting: "" }} />);
  openBlock("Identitas & undangan");
  const greeting = screen.getByRole("textbox", { name: "Sapaan" }) as HTMLInputElement;
  expect(greeting.placeholder).toMatch(/^Contoh: /);
  const chips = screen.getByRole("group", { name: "Pilihan cepat: Sapaan" });
  fireEvent.click(within(chips).getByRole("button", { name: "Dengan hormat" }));
  expect(greeting.value).toBe("Dengan hormat");
  expect(within(chips).getByRole("button", { name: "Dengan hormat" }).getAttribute("aria-pressed")).toBe("true");
  expect(within(chips).queryByRole("button", { name: /Kembalikan/ })).toBeNull();
  fireEvent.change(greeting, { target: { value: "Salam hangat dari kami" } });
  fireEvent.click(within(chips).getByRole("button", { name: "Selamat datang" }));
  expect(greeting.value).toBe("Selamat datang");
  fireEvent.click(within(chips).getByRole("button", { name: /Kembalikan teks sebelumnya/ }));
  expect(greeting.value).toBe("Salam hangat dari kami");
});

it("fills the Werkudara office in one click", () => {
  render(<EventEditor event={{ ...createSeedEvent(), venue_name: "", address: "", location_url: "" }} />);
  openBlock("Lokasi");
  fireEvent.click(screen.getByRole("button", { name: /Pakai alamat kantor Werkudara/ }));
  expect((screen.getByRole("textbox", { name: "Nama tempat" }) as HTMLInputElement).value).toBe("PT. Werkudara");
  expect((screen.getByRole("textbox", { name: "Alamat" }) as HTMLTextAreaElement).value).toMatch(/^Jl\. Bhinneka/);
  expect((screen.getByRole("textbox", { name: "Tautan lokasi Maps" }) as HTMLInputElement).value).toMatch(/^https:\/\/maps\.app\.goo\.gl\//);
  expect(screen.queryByRole("button", { name: /Pakai alamat kantor Werkudara/ })).toBeNull();
});

it("keeps the regular editor short: no theme block, unused parts folded away", () => {
  render(<EventEditor event={createSeedEvent()} />);
  expect(menuButton("Jenis, audiens, dan tampilan")).toBeNull();
  const more = otherBlocks()!;
  for (const title of ["Pengalaman kunjungan", "Persiapan tamu", "Our Team"]) expect(within(more).getByRole("button", { name: new RegExp(`^${title}`) })).toBeTruthy();
  expect(within(more).queryByRole("button", { name: /^Rundown/ })).toBeNull();
});

it("adds a folded part to the invitation from its own panel", () => {
  render(<EventEditor event={createSeedEvent()} />);
  openBlock("Our Team");
  const toggle = screen.getByRole("switch", { name: "Tampilkan Our Team di undangan" });
  expect((toggle as HTMLInputElement).checked).toBe(false);
  expect(screen.getByText(/belum tampil untuk tamu/)).toBeTruthy();
  fireEvent.click(toggle);
  expect((toggle as HTMLInputElement).checked).toBe(true);
  expect(screen.queryByText(/belum tampil untuk tamu/)).toBeNull();
  expect(within(menuButton("Our Team")!).getByText("Aktif")).toBeTruthy();
  const more = otherBlocks();
  expect(more ? within(more).queryByRole("button", { name: /^Our Team/ }) : null).toBeNull();
  expect(menuButton("Our Team")).toBeTruthy();
});

it("switches RSVP on and off from the block header, together with accepting answers", async () => {
  render(<EventEditor event={createSeedEvent()} />);
  openBlock("Penerimaan RSVP");
  const toggle = screen.getByRole("switch", { name: "Tampilkan Penerimaan RSVP di undangan" }) as HTMLInputElement;
  expect(toggle.checked).toBe(true);
  expect(within(menuButton("Penerimaan RSVP")!).getByText("Aktif")).toBeTruthy();
  fireEvent.click(toggle);
  expect(toggle.checked).toBe(false);
  expect(within(menuButton("Penerimaan RSVP")!).queryByText("Aktif")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
  const saved = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
  expect(saved.rsvp_enabled).toBe(false);
  expect(saved.sections.find((section: { key: string }) => section.key === "rsvp").enabled).toBe(false);
});

it("has no switch on blocks that are always part of the invitation", () => {
  render(<EventEditor event={createSeedEvent()} />);
  expect(screen.queryByRole("switch")).toBeNull();
});

it("keeps one save button at the top that says whether anything is unsaved", () => {
  render(<EventEditor event={createSeedEvent()} />);
  const save = screen.getByRole("button", { name: "Simpan perubahan" });
  expect(save.textContent).toContain("Tersimpan");
  expect(screen.queryByRole("link", { name: /Pratinjau tersimpan/ })).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Judul acara" }), { target: { value: "Judul baru" } });
  expect(save.textContent).toContain("Simpan");
  expect(save.textContent).not.toContain("Tersimpan");
  // The bar sits before the editor, so it never floats over the form.
  expect(save.compareDocumentPosition(screen.getByRole("textbox", { name: "Judul acara" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("numbers only the switched-on modules, the same way in the chips, the menu and the open header", () => {
  render(<EventEditor event={createSeedEvent()} />);
  const chipList = () => within(screen.getByRole("list", { name: "Modul aktif" })).getAllByRole("button");
  // The menu's "Aktif" entries, in order, are the chips 1, 2, 3 …
  const active = within(editorMenu()).getAllByRole("button").filter(button => /Aktif$/.test(button.textContent ?? ""));
  expect(active.length).toBeGreaterThan(1);
  expect(active.map(button => button.querySelector("b")?.textContent)).toEqual(active.map((_, index) => String(index + 1)));
  expect(within(editorMenu()).getAllByRole("button").filter(button => button.querySelector("b"))).toHaveLength(active.length);
  expect(chipList().map(chip => chip.getAttribute("title"))).toEqual(active.map(button => button.querySelector("span")?.textContent));
  // A part without a switch (Identitas) has no number.
  expect(menuButton("Identitas & undangan")?.querySelector("b")).toBeNull();
  // A tap on a chip opens that module; its header carries the same number.
  const second = chipList()[1];
  fireEvent.click(second);
  expect(second.getAttribute("aria-current")).toBe("true");
  expect(screen.getByRole("heading", { level: 2, name: second.getAttribute("title")! })).toBeTruthy();
  expect(screen.getByRole("heading", { level: 2 }).closest("header")?.textContent).toMatch(/^2/);
  // Switching it off takes it out of the numbering.
  const count = chipList().length;
  fireEvent.click(screen.getByRole("switch"));
  expect(chipList()).toHaveLength(count - 1);
  expect(screen.getByRole("heading", { level: 2 }).closest("header")?.textContent).not.toMatch(/^2/);
});
