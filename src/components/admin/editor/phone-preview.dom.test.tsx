import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { PhonePreview } from "./PhonePreview";

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function fromFrame(data: unknown) {
  const frame = screen.getByTitle("Pratinjau undangan di ponsel") as HTMLIFrameElement;
  act(() => { window.dispatchEvent(new MessageEvent("message", { data, origin: location.origin, source: frame.contentWindow })); });
  return frame;
}

it("sends the draft when the phone is ready, then again shortly after each change", () => {
  const event = createSeedEvent();
  const { rerender } = render(<PhonePreview device="mobile" onDevice={() => {}} event={event} phase="before" onPhase={() => {}} focus={null} onFocusArea={() => {}} />);
  const frame = screen.getByTitle("Pratinjau undangan di ponsel") as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  fromFrame({ type: "preview:ready" });
  expect(post).toHaveBeenCalledWith({ type: "preview:update", event, phase: "before" }, location.origin);
  const changed = { ...event, title: "Judul baru" };
  rerender(<PhonePreview device="mobile" onDevice={() => {}} event={changed} phase="day" onPhase={() => {}} focus="agenda" onFocusArea={() => {}} />);
  expect(post).toHaveBeenCalledWith({ type: "preview:scroll", area: "agenda" }, location.origin);
  act(() => { vi.advanceTimersByTime(300); });
  expect(post).toHaveBeenLastCalledWith({ type: "preview:update", event: changed, phase: "day" }, location.origin);
});

it("opens the block for a tapped part and ignores messages from elsewhere", () => {
  const onFocusArea = vi.fn();
  render(<PhonePreview device="mobile" onDevice={() => {}} event={createSeedEvent()} phase="before" onPhase={() => {}} focus={null} onFocusArea={onFocusArea} />);
  fromFrame({ type: "preview:focus", area: "contact" });
  expect(onFocusArea).toHaveBeenCalledWith("contact");
  act(() => { window.dispatchEvent(new MessageEvent("message", { data: { type: "preview:focus", area: "rsvp" }, origin: "https://evil.example", source: window })); });
  expect(onFocusArea).toHaveBeenCalledTimes(1);
});

it("switches the journey phase shown", () => {
  const onPhase = vi.fn();
  render(<PhonePreview device="mobile" onDevice={() => {}} event={createSeedEvent()} phase="before" onPhase={onPhase} focus={null} onFocusArea={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Hari H" }));
  expect(onPhase).toHaveBeenCalledWith("day");
  expect(screen.getByRole("button", { name: "Sebelum" }).getAttribute("aria-pressed")).toBe("true");
});

it("offers the web view next to the phone", () => {
  const onDevice = vi.fn();
  const { rerender } = render(<PhonePreview device="mobile" onDevice={onDevice} event={createSeedEvent()} phase="before" onPhase={() => {}} focus={null} onFocusArea={() => {}} address="invitation.example/AB23CD" />);
  expect(screen.getByRole("button", { name: /Ponsel/ }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: /Web/ }));
  expect(onDevice).toHaveBeenCalledWith("web");
  rerender(<PhonePreview device="web" onDevice={onDevice} event={createSeedEvent()} phase="before" onPhase={() => {}} focus={null} onFocusArea={() => {}} address="invitation.example/AB23CD" />);
  expect((screen.getByTitle("Pratinjau undangan di web") as HTMLIFrameElement).width).toBe("1280");
  expect(screen.getByText("invitation.example/AB23CD")).toBeTruthy();
});
