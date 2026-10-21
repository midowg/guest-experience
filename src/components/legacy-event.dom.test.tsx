import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { normalizeEvent } from "@/lib/hero-framing";
import type { EventRecord } from "@/lib/types";
import { EventEditor } from "@/components/admin/editor/EventEditor";
import { EventExperience } from "./guest/EventExperience";

vi.setConfig({ testTimeout: 20000 });
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
afterEach(cleanup);

/** An event as stored before 20 Oct: none of the fields added that day. */
function storedBefore20Oct(): EventRecord {
  const event: Partial<EventRecord> = { ...createSeedEvent() };
  for (const key of ["prepare", "language", "translations", "guest_estimate"] as const) delete event[key];
  event.sections = event.sections!.filter(section => section.key !== "prepare");
  return event as EventRecord;
}

it("opens an older event in the editor, including its new blocks", () => {
  render(<EventEditor event={normalizeEvent(storedBefore20Oct())} />);
  for (const title of ["Persiapan tamu", "Bahasa & terjemahan", "Penerimaan RSVP"]) {
    fireEvent.click(screen.getByRole("button", { name: `Ubah ${title}` }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  }
});

it("shows an older event to guests", () => {
  render(<EventExperience event={normalizeEvent(storedBefore20Oct())} preview />);
  expect(screen.getByRole("heading", { level: 1, name: createSeedEvent().title })).toBeTruthy();
});
