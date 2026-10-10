import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { EventExperience } from "./EventExperience";
import { createSeedEvent } from "@/lib/seed-event";

const event = { ...createSeedEvent(), status: "published" as const };
const header = () => document.querySelector("header");
const hidden = () => !!header()?.className.match(/siteHeaderHidden/);

function scrollTo(y: number) {
  act(() => {
    Object.defineProperty(window, "scrollY", { value: y, configurable: true, writable: true });
    window.dispatchEvent(new Event("scroll"));
  });
}

beforeEach(() => {
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true, writable: true });
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true, writable: true });
});
afterEach(cleanup);

describe("header reveal on scroll", () => {
  it("is hidden when the page first loads at the top", () => {
    render(<EventExperience event={event} preview />);
    expect(hidden()).toBe(true);
  });

  it("appears once the opening has been scrolled past", () => {
    render(<EventExperience event={event} preview />);
    scrollTo(600);
    expect(hidden()).toBe(false);
  });

  it("hides again when the guest returns to the top", () => {
    render(<EventExperience event={event} preview />);
    scrollTo(600);
    expect(hidden()).toBe(false);
    scrollTo(0);
    expect(hidden()).toBe(true);
  });

  it("stays hidden for a small nudge that has not cleared the opening", () => {
    render(<EventExperience event={event} preview />);
    scrollTo(80);
    expect(hidden()).toBe(true);
  });

  it("is already visible when the page loads part-way down", () => {
    Object.defineProperty(window, "scrollY", { value: 900, configurable: true, writable: true });
    render(<EventExperience event={event} preview />);
    expect(hidden()).toBe(false);
  });

  it("keeps its links out of the tab order while hidden", () => {
    render(<EventExperience event={event} preview />);
    // visibility:hidden removes them from the tab order; the class carries that rule.
    expect(header()?.className).toContain("siteHeaderHidden");
    scrollTo(600);
    expect(header()?.className).not.toContain("siteHeaderHidden");
  });
});
