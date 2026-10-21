import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import type { StaffMember } from "@/lib/types";
import { StaffPicker } from "@/components/admin/editor/StaffPicker";
import { PicAvatar } from "@/components/guest/JourneyPanels";
import { StaffSettings } from "./StaffSettings";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const person = (n: number, name: string, over: Partial<StaffMember> = {}): StaffMember => ({
  id: `5f000000-0000-4000-8000-00000000000${n}`, name, role: "Hospitality", phone: "0812 3456 7890", photo: { url: "", alt: "", srcset: [] }, active: true, sort_order: n, ...over,
});

it("picks the PIC from the team in one tap", () => {
  const onPick = vi.fn();
  render(<StaffPicker staff={[person(1, "Raka Pratama"), person(2, "Sari Dewi", { role: "Sales" })]} contact={createSeedEvent().contact} onPick={onPick} />);
  fireEvent.click(screen.getByRole("button", { name: /Sari Dewi/ }));
  expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ name: "Sari Dewi", role: "Sales", phone: "0812 3456 7890", organization: "Werkudara", staff_id: person(2, "").id }));
});

it("points to the super admin when the team list is empty", () => {
  render(<StaffPicker staff={[]} contact={createSeedEvent().contact} onPick={() => {}} />);
  expect(screen.getByText(/Tim Werkudara masih kosong/)).toBeTruthy();
});

it("adds a team member from the super admin dashboard", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, data: person(3, "Budi Santoso"), message: "Anggota tim ditambahkan." }), { status: 200 }));
  render(<StaffSettings initial={[person(1, "Raka Pratama")]} migrated />);
  fireEvent.click(screen.getByRole("button", { name: "Tambah orang" }));
  fireEvent.change(screen.getByLabelText("Nama"), { target: { value: "Budi Santoso" } });
  fireEvent.change(screen.getByLabelText("Jabatan"), { target: { value: "Hospitality" } });
  fireEvent.change(screen.getByLabelText("Nomor WhatsApp"), { target: { value: "0812 3456 7890" } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
  expect(await screen.findByText("Anggota tim ditambahkan.")).toBeTruthy();
  const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("/api/admin/staff");
  expect(JSON.parse(String(init.body))).toMatchObject({ name: "Budi Santoso", role: "Hospitality", phone: "0812 3456 7890", active: true });
  expect(within(screen.getByRole("list")).getByText("Budi Santoso")).toBeTruthy();
});

it("waits for the migration before offering edits", () => {
  render(<StaffSettings initial={[]} migrated={false} />);
  expect(screen.getByText(/202610210005_staff_members.sql/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Tambah orang" })).toBeNull();
});

it("shows the PIC photo to guests, or initials without one", () => {
  const contact = { ...createSeedEvent().contact, name: "Raka Pratama" };
  const { container, rerender } = render(<PicAvatar contact={{ ...contact, photo: { url: "https://foto.example/raka.webp", alt: "Raka", srcset: [] } }} />);
  expect(container.querySelector("img")?.getAttribute("src")).toBe("https://foto.example/raka.webp");
  rerender(<PicAvatar contact={contact} />);
  expect(container.textContent).toBe("RP");
});
