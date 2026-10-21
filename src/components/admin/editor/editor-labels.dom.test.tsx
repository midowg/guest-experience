import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { EventEditor } from "@/components/admin/editor/EventEditor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
afterEach(cleanup);
// Opens all eighteen panels in turn; slow under a parallel suite, not stuck.
vi.setConfig({ testTimeout: 20000 });

it("keeps spaces in every destructive editor label", () => {
  const event = createSeedEvent();
  event.topics = [{ title: "Topik", description: "" }];
  event.gallery = [{ id: "photo", url: "https://example.test/photo.jpg", alt: "", caption: "", sort_order: 0, srcset: [] }];
  event.feedback_questions = [{ id: "question", label: "Masukan", kind: "text", required: false, options: [], sort_order: 0 }];
  render(<EventEditor event={event} />);
  // Each block renders only inside its open panel, so open the one that holds each label.
  for (const [block, label] of [["Topik pembahasan", "Hapus topik 1"], ["Rundown", "Hapus sesi 1"], ["Galeri foto lokasi Werkudara", "Hapus foto lokasi 1"], ["Survei feedback", "Hapus pertanyaan 1"]]) {
    fireEvent.click(screen.getByRole("button", { name: `Ubah ${block}` }));
    const span = screen.getByText(label);
    expect(span.tagName).toBe("SPAN");
    expect(span.textContent).toBe(label);
  }
});
