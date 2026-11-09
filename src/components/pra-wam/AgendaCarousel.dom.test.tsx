import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AgendaCarousel } from "./AgendaCarousel";

afterEach(cleanup);
beforeAll(() => {
  // jsdom has neither scrolling nor media queries.
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

it("opens on the card that matters now, with the earlier ones before it and where one is", () => {
  render(<AgendaCarousel start={1} labels={["Kemarin", "Sekarang", "Besok"]}>
    <p>Rapat kemarin</p><p>Rapat sekarang</p><p>Rapat besok</p>
  </AgendaCarousel>);
  expect(screen.getByRole("heading", { name: "Agenda" })).toBeTruthy();
  expect(screen.getByText("2 dari 3")).toBeTruthy();
  const slides = screen.getAllByRole("group");
  expect(slides.map(slide => slide.getAttribute("aria-label"))).toEqual(["1 dari 3: Kemarin", "2 dari 3: Sekarang", "3 dari 3: Besok"]);
  expect((screen.getByRole("button", { name: "Agenda sebelumnya" }) as HTMLButtonElement).disabled).toBe(false);
  expect((screen.getByRole("button", { name: "Agenda berikutnya" }) as HTMLButtonElement).disabled).toBe(false);
  expect(Element.prototype.scrollTo).toHaveBeenCalled();
});
