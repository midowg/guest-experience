import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createSeedEvent } from "@/lib/seed-event";
import { EventEditor } from "./EventEditor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

it("keeps spaces in every destructive editor label", () => {
  const event = createSeedEvent();
  event.topics = [{ title: "Topik", description: "" }];
  event.gallery = [{ id: "photo", url: "https://example.test/photo.jpg", alt: "", caption: "", sort_order: 0, srcset: [] }];
  event.feedback_questions = [{ id: "question", label: "Masukan", kind: "text", required: false, options: [], sort_order: 0 }];
  const html = renderToStaticMarkup(<EventEditor event={event} />);
  for (const label of ["Hapus topik 1", "Hapus sesi 1", "Hapus foto lokasi 1", "Hapus pertanyaan 1"]) {
    expect(html).toContain(`<span>${label}</span>`);
  }
  expect(html).not.toMatch(/Hapus(?:foto|topik|sesi|pertanyaan)/);
});
