import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { PublicLinkCard } from "@/components/admin/invitations/PublicLinkCard";

const qr = vi.hoisted(() => ({ toDataURL: vi.fn(async () => "data:image/png;base64,AAAA"), toString: vi.fn(async () => "<svg/>") }));
vi.mock("qrcode", () => ({ default: qr }));
afterEach(() => { cleanup(); qr.toDataURL.mockClear(); });

it("shows the general link on the public address and its QR", async () => {
  render(<PublicLinkCard event={{ ...createSeedEvent(), slug: "trip-lombok", status: "published" }} origin="https://invitation.example" />);
  expect(screen.getByText("https://invitation.example/e/trip-lombok")).toBeTruthy();
  expect((await screen.findByRole("img", { name: /QR menuju/ })).getAttribute("src")).toBe("data:image/png;base64,AAAA");
  expect(qr.toDataURL).toHaveBeenCalledWith("https://invitation.example/e/trip-lombok", expect.objectContaining({ width: 240 }));
  expect(screen.queryByText(/setelah acara dipublikasikan/)).toBeNull();
});

it("downloads a print-size PNG and warns while the event is a draft", async () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(<PublicLinkCard event={{ ...createSeedEvent(), slug: "trip-lombok", status: "draft" }} origin="https://invitation.example" />);
  expect(screen.getByText(/setelah acara dipublikasikan/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Unduh PNG" }));
  await vi.waitFor(() => expect(click).toHaveBeenCalled());
  expect(qr.toDataURL).toHaveBeenCalledWith("https://invitation.example/e/trip-lombok", expect.objectContaining({ width: 1200 }));
  expect(screen.getByRole("status").textContent).toBe("QR PNG diunduh.");
  click.mockRestore();
});
