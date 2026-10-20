import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import type { EventRecord } from "@/lib/types";
import { EventExperience } from "./EventExperience";

vi.setConfig({ testTimeout: 20000 });
let bodies: { url: string; body: Record<string, unknown> }[] = [];
beforeEach(() => {
  bodies = [];
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    bodies.push({ url, body: JSON.parse(init.body as string) });
    return new Response(JSON.stringify({ ok: true, message: "Tersimpan", data: { id: crypto.randomUUID() } }), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function openEvent(patch: Partial<EventRecord> = {}): EventRecord {
  return { ...createSeedEvent(), status: "published", rsvp_enabled: true, rsvp_closes_at: null, ...patch };
}
const next = () => fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
const sheet = () => screen.getByRole("dialog");
const rsvpPosts = () => bodies.filter(item => item.url.endsWith("/rsvp"));
const agree = () => fireEvent.click(screen.getByRole("checkbox", { name: /setuju data ini dipakai/ }));
const send = () => fireEvent.click(screen.getByRole("button", { name: "Kirim" }));

it("walks four steps with food and access needs and sends them with the photo choice", async () => {
  render(<EventExperience event={openEvent()} />);
  fireEvent.click(screen.getByRole("button", { name: "Mulai konfirmasi" }));
  expect(within(sheet()).getByText("Langkah 1 dari 4")).toBeTruthy();
  next();
  expect(screen.getByText("Jawab pertanyaan ini terlebih dahulu.")).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "Ya, saya hadir" }));
  next();
  fireEvent.change(screen.getByRole("textbox", { name: "Nama lengkap" }), { target: { value: "Sari Dewi" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Instansi / komunitas" }), { target: { value: "Mitra" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Nomor WhatsApp (opsional)" }), { target: { value: "0812 3456 7890" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Boleh dihubungi lewat WhatsApp/ }));
  next();
  expect(within(sheet()).getByText("Langkah 3 dari 4")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "Vegetarian" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Alergi makanan" }));
  next();
  expect(screen.getByText("Jelaskan alergi makanan yang perlu diperhatikan.")).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "Sebutkan alergennya" }), { target: { value: "Kacang" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Juru bahasa isyarat" }));
  next();
  expect(within(sheet()).getByText(/Vegetarian · Alergi makanan: Kacang · Juru bahasa isyarat/)).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: /jangan tampilkan foto saya/ }));
  send();
  expect(screen.getByText("Persetujuan penggunaan data diperlukan.")).toBeTruthy();
  agree();
  send();
  await waitFor(() => expect(rsvpPosts()).toHaveLength(1));
  expect(rsvpPosts()[0].body).toMatchObject({
    name: "Sari Dewi", organization: "Mitra", attendance: "yes", phone: "0812 3456 7890", whatsapp_consent: true,
    dietary: ["vegetarian", "allergy"], has_allergy: true, allergy_details: "Kacang", access: ["sign_interpreter"], photo_opt_out: true, party_size: 1,
  });
  expect(await screen.findByRole("heading", { name: "Anda terkonfirmasi hadir" })).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("skips the needs step for a guest who cannot come", async () => {
  render(<EventExperience event={openEvent()} />);
  fireEvent.click(screen.getByRole("button", { name: "Mulai konfirmasi" }));
  fireEvent.click(screen.getByRole("radio", { name: "Maaf, tidak bisa" }));
  next();
  expect(within(sheet()).getByText("Langkah 2 dari 3")).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "Nama lengkap" }), { target: { value: "Budi" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Instansi / komunitas" }), { target: { value: "Mitra" } });
  next();
  expect(screen.getByRole("heading", { name: "Periksa sebelum mengirim" })).toBeTruthy();
  agree();
  send();
  await waitFor(() => expect(rsvpPosts()).toHaveLength(1));
  expect(rsvpPosts()[0].body).toMatchObject({ attendance: "no", dietary: [], access: [], party_size: 1 });
});

it("lets a personal invitee bring companions up to the invitation's limit", async () => {
  const event = openEvent({ invitation_mode: "personal" });
  render(<EventExperience event={event} invitation={{ name: "Bu Sari", token: "a".repeat(64), rsvp: null, party_size_max: 3 }} />);
  fireEvent.click(screen.getByRole("button", { name: "Mulai konfirmasi" }));
  expect(screen.getByRole("heading", { name: "Apakah Anda bisa hadir, Bu Sari?" })).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "Ya, saya hadir" }));
  const plus = screen.getByRole("button", { name: "+" });
  fireEvent.click(plus); fireEvent.click(plus);
  expect(screen.getByText("+2 pendamping")).toBeTruthy();
  expect((plus as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole("textbox", { name: "Nama pendamping 1 (opsional)" }), { target: { value: "Raka" } });
  next();
  expect((screen.getByRole("textbox", { name: "Nama lengkap" }) as HTMLInputElement).value).toBe("Bu Sari");
  fireEvent.change(screen.getByRole("textbox", { name: "Instansi / komunitas" }), { target: { value: "Mitra" } });
  next();
  fireEvent.click(screen.getByRole("button", { name: "Tidak ada kebutuhan khusus" }));
  expect(within(sheet()).getByText(/Hadir · 3 orang/)).toBeTruthy();
  agree();
  send();
  await waitFor(() => expect(rsvpPosts()).toHaveLength(1));
  expect(rsvpPosts()[0].body).toMatchObject({ party_size: 3, companion_names: ["Raka"] });
});

it("asks only about allergies until the needs migration exists", async () => {
  render(<EventExperience event={openEvent()} rsvpNeeds={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Mulai konfirmasi" }));
  fireEvent.click(screen.getByRole("radio", { name: "Ya, saya hadir" }));
  next();
  fireEvent.change(screen.getByRole("textbox", { name: "Nama lengkap" }), { target: { value: "Sari Dewi" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Instansi / komunitas" }), { target: { value: "Mitra" } });
  next();
  expect(screen.queryByRole("checkbox", { name: "Vegetarian" })).toBeNull();
  expect(screen.queryByRole("checkbox", { name: "Kursi roda" })).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: "Alergi makanan" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Sebutkan alergennya" }), { target: { value: "Udang" } });
  next();
  expect(screen.queryByRole("checkbox", { name: /jangan tampilkan foto saya/ })).toBeNull();
  agree();
  send();
  await waitFor(() => expect(rsvpPosts()).toHaveLength(1));
  expect(rsvpPosts()[0].body).toEqual({ name: "Sari Dewi", organization: "Mitra", attendance: "yes", phone: "", email: "", has_allergy: true, allergy_details: "Udang", consent: true, website: "", idempotency_key: expect.any(String) });
});

it("speaks English in the sheet for an English event", () => {
  render(<EventExperience event={openEvent({ language: "en" })} />);
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  expect(screen.getByRole("heading", { name: "Will you be able to join us?" })).toBeTruthy();
  expect(screen.getByRole("radio", { name: "Yes, I'll be there" })).toBeTruthy();
  expect(within(sheet()).getByText("Step 1 of 4")).toBeTruthy();
});

it("opens the survey in a sheet and sends the answers", async () => {
  const event = openEvent({ feedback_enabled: true, feedback_opens_at: null, feedback_questions: [{ id: "8b1d0000-0000-4000-8000-000000000001", label: "Seberapa puas Anda?", kind: "rating", required: true, options: [], sort_order: 0 }] });
  event.sections = event.sections.map(section => section.key === "feedback" ? { ...section, enabled: true } : section);
  render(<EventExperience event={event} />);
  fireEvent.click(screen.getByRole("button", { name: "Mulai survei" }));
  fireEvent.click(within(sheet()).getByRole("button", { name: "Kirim masukan" }));
  expect(within(sheet()).getByText("Jawab pertanyaan ini terlebih dahulu.")).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox", { name: /Seberapa puas Anda\? \(wajib\)/ }), { target: { value: "5" } });
  fireEvent.click(within(sheet()).getByRole("button", { name: "Kirim masukan" }));
  await waitFor(() => expect(bodies.some(item => item.url.endsWith("/feedback"))).toBe(true));
  expect(await screen.findByText("Terima kasih telah berbagi pengalaman.")).toBeTruthy();
});
