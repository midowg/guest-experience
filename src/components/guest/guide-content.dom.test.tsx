import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { EventExperience } from "./EventExperience";

afterEach(cleanup);

it("keeps Our Team hidden by default and shows static copy without a photo when enabled", () => {
  const event = createSeedEvent();
  const { rerender } = render(<EventExperience event={event} preview />);
  expect(screen.queryByRole("heading", { name: "Our Team" })).toBeNull();
  event.sections = event.sections.map(section => section.key === "team" ? { ...section, enabled: true } : section);
  rerender(<EventExperience event={{ ...event }} preview />);
  expect(screen.getByRole("heading", { name: "Our Team" })).toBeTruthy();
  expect(screen.getByText(/termasuk rekan Tuli dan pengguna kursi roda/)).toBeTruthy();
  expect(screen.queryByRole("img", { name: "Tim Werkudara" })).toBeNull();
});

it("renders an optional team photo with alt text", () => {
  const event = createSeedEvent();
  event.sections = event.sections.map(section => section.key === "team" ? { ...section, enabled: true } : section);
  event.team_image = { url: "https://example.test/team.webp", alt: "Tim Werkudara", srcset: [] };
  render(<EventExperience event={event} preview />);
  expect(screen.getByRole("img", { name: "Tim Werkudara" }).getAttribute("src")).toBe(event.team_image.url);
});

it("uses custom feedback and review text only where those sections are enabled", () => {
  const event = createSeedEvent();
  event.feedback_enabled = true;
  event.feedback_questions = [{ id: "b1d26d64-2ab8-4d7a-80b5-328a132ea2cc", label: "Bagaimana kunjungan Anda?", kind: "text", required: false, options: [], sort_order: 0 }];
  event.feedback_description = "Pengalaman Anda membantu kami berkembang.";
  event.review_url = "https://example.test/review";
  event.review_enabled = true;
  event.review_heading = "Your Experience Matters";
  event.review_description = "Bagikan cerita kunjungan Anda di Google.";
  event.review_button_label = "Write a Google Review";
  const { rerender } = render(<EventExperience event={event} preview />);
  expect(screen.getByText(event.feedback_description)).toBeTruthy();
  expect(screen.getByRole("heading", { name: event.review_heading })).toBeTruthy();
  expect(screen.getByText(event.review_description)).toBeTruthy();
  expect(screen.getByRole("link", { name: /Write a Google Review/ }).getAttribute("href")).toBe(event.review_url);
  rerender(<EventExperience event={{ ...event, review_enabled: false }} preview />);
  expect(screen.queryByRole("heading", { name: event.review_heading })).toBeNull();
});

it("keeps the old review label when no custom copy is provided", () => {
  const event = createSeedEvent();
  event.review_url = "https://example.test/review";
  event.review_enabled = true;
  render(<EventExperience event={event} preview />);
  expect(screen.getByRole("link", { name: /Bagikan ulasan Anda/ })).toBeTruthy();
});
