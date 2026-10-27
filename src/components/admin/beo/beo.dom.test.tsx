import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { beoSummary, emptyBeo, type BeoState } from "@/lib/beo";
import { emptyBrief } from "@/lib/hosting-brief";
import { createSeedEvent } from "@/lib/seed-event";
import type { RsvpRecord } from "@/lib/types";
import { BeoView } from "@/components/admin/beo/BeoView";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); refresh.mockClear(); });

const event = { ...createSeedEvent(), guest_estimate: 30 };
const rsvps: RsvpRecord[] = [
  { id: "r1", event_id: event.id, name: "Ayu Lestari", organization: "", attendance: "yes", phone: "", email: "", has_allergy: true, allergy_details: "Kacang", party_size: 2, dietary: ["allergy"], access: ["wheelchair"], created_at: "2026-10-20T00:00:00Z" },
];
function view(state: Partial<BeoState> = {}, migrated = true) {
  const initial = { ...emptyBeo, ...state };
  return render(<BeoView event={event} summary={beoSummary(event, rsvps, initial.locked_at)} initial={initial} revisions={[]} migrated={migrated} />);
}
function respond(data: Partial<BeoState>) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { ...emptyBeo, ...data }, message: "Status BEO diperbarui." }), { status: 200 }));
}

it("shows the three numbers, allergies and access needs", () => {
  view();
  // The live preview beside the form repeats the same numbers, so read the form's own.
  const form = screen.getByRole("group", { name: "Bagian BEO" }).parentElement!;
  expect(within(form).getByText("Perkiraan dari survei").nextSibling?.textContent).toBe("30");
  expect(within(form).getByText("RSVP hadir").nextSibling?.textContent).toBe("2");
  const allergy = within(form).getByRole("table", { name: "Alergi" });
  expect(within(allergy).getByText("Kacang")).toBeTruthy();
  expect(within(form).getByText(/Kursi roda/)).toBeTruthy();
});

it("sets the number from a draft with the version it was read at", async () => {
  const fetch = respond({ status: "set", version: 2, prepared_count: 35 });
  view({ version: 1 });
  fireEvent.change(screen.getByLabelText("Jumlah porsi/pax disiapkan"), { target: { value: "35" } });
  fireEvent.click(screen.getByRole("button", { name: "Tetapkan angka" }));
  await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
  expect(url).toBe(`/api/admin/events/${event.id}/beo`);
  expect(JSON.parse(String(init.body))).toMatchObject({ action: "set", version: 1, prepared_count: 35 });
});

it("changes a set number only through a revision with a reason", async () => {
  const fetch = respond({ status: "revised", version: 3, prepared_count: 40 });
  view({ status: "set", version: 2, prepared_count: 35, locked_at: "2026-10-19T00:00:00Z" });
  expect((screen.getByLabelText("Jumlah porsi/pax disiapkan") as HTMLInputElement).disabled).toBe(true);
  expect(screen.queryByRole("button", { name: "Simpan draf" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Revisi angka" }));
  const save = screen.getByRole("button", { name: "Simpan revisi" }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Jumlah porsi/pax disiapkan"), { target: { value: "40" } });
  fireEvent.change(screen.getByLabelText("Alasan revisi"), { target: { value: "Klien menambah 5 tamu" } });
  fireEvent.click(save);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(JSON.parse(String((fetch.mock.calls[0] as [string, RequestInit])[1].body))).toMatchObject({ action: "revise", version: 2, prepared_count: 40, reason: "Klien menambah 5 tamu" });
});

it("warns when answers changed after the numbers were set", () => {
  view({ status: "set", version: 2, locked_at: "2026-10-19T00:00:00Z" });
  expect(screen.getByText(/Perlu ditinjau: 1 jawaban RSVP/)).toBeTruthy();
});

it("prints and exports every page at once, with the supplier version as a small extra", () => {
  view();
  const preview = screen.getByRole("complementary", { name: "Pratinjau lembar BEO" });
  const links = within(preview).getAllByRole("link").map(link => link.getAttribute("href"));
  expect(links).toEqual([
    `/admin/acara/${event.id}/beo/cetak`, `/api/admin/events/${event.id}/beo/pdf`, `/api/admin/events/${event.id}/beo/pdf?versi=penyedia`,
  ]);
  expect(within(preview).getByRole("heading", { name: event.title })).toBeTruthy();
});

it("saves the hosting brief with the version it was read at, and shows it as page 2", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { brief: { ...emptyBrief(), guest_name: "Budi Hartono" }, version: 4, migrated: true }, message: "Brief tamu tersimpan." }), { status: 200 }));
  render(<BeoView event={event} summary={beoSummary(event, rsvps)} initial={emptyBeo} revisions={[]} migrated brief={{ brief: emptyBrief(), version: 3, migrated: true }} />);
  fireEvent.click(screen.getByRole("button", { name: "Brief tamu" }));
  fireEvent.change(screen.getByLabelText("Tamu utama"), { target: { value: "Budi Hartono" } });
  fireEvent.click(screen.getByRole("button", { name: "Vendor" }));
  expect(within(screen.getByRole("complementary", { name: "Pratinjau lembar BEO" })).getByText(/Halaman 2 dari 2/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Simpan brief" }));
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
  expect(url).toBe(`/api/admin/events/${event.id}/beo/brief`);
  expect(JSON.parse(String(init.body))).toMatchObject({ version: 3, brief: { guest_name: "Budi Hartono", relation: "vendor" } });
});

it("is read-only before the migration", () => {
  view({}, false);
  expect(screen.getAllByText(/menunggu migrasi/).length).toBeGreaterThan(0);
  expect(screen.queryByLabelText("Jumlah porsi/pax disiapkan")).toBeNull();
  expect(screen.getByRole("link", { name: /^Unduh PDF/ })).toBeTruthy();
});
