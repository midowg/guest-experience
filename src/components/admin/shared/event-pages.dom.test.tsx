import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { EventPagesMenu } from "./EventPagesMenu";

afterEach(cleanup);
const groups = [
  { label: "Edit", pages: [{ tab: "edit" as const, label: "Edit acara", href: "/admin/acara/AB23CD" }] },
  { label: "Tamu", pages: [{ tab: "invitations" as const, label: "Daftar tamu", href: "/admin/acara/AB23CD/undangan" }, { tab: "responses" as const, label: "RSVP", href: "/admin/acara/AB23CD/rsvp" }] },
];

it("names the current page and lists the others in one dropdown", () => {
  render(<EventPagesMenu groups={groups} current="responses" publicHref="/AB23CD" />);
  const trigger = screen.getByRole("button", { name: /RSVP/ });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("link", { name: "Daftar tamu" })).toBeNull();
  fireEvent.click(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  const list = document.getElementById("event-pages")!;
  expect(within(list).getByRole("link", { name: "Daftar tamu" }).getAttribute("href")).toBe("/admin/acara/AB23CD/undangan");
  expect(within(list).getByRole("link", { name: "RSVP" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: /Buka undangan/ }).getAttribute("href")).toBe("/AB23CD");
});

it("closes with Escape or a tap outside", () => {
  render(<div><p>luar</p><EventPagesMenu groups={groups} current="edit" /></div>);
  const trigger = screen.getByRole("button", { name: /Edit acara/ });
  fireEvent.click(trigger);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(trigger);
  fireEvent.pointerDown(screen.getByText("luar"));
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("link", { name: /Buka undangan/ })).toBeNull();
});

it("shows both pages side by side when there are only two (Friday Sharing)", () => {
  render(<EventPagesMenu current="donations" publicHref="/AB23CD" publicLabel="Buka halaman donasi" groups={[
    { label: "Edit", pages: [{ tab: "edit", label: "Edit halaman", href: "/admin/acara/AB23CD" }] },
    { label: "Donasi", pages: [{ tab: "donations", label: "Donasi masuk", href: "/admin/acara/AB23CD/donasi" }] },
  ]} />);
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByRole("link", { name: "Edit halaman" }).getAttribute("href")).toBe("/admin/acara/AB23CD");
  expect(screen.getByRole("link", { name: "Donasi masuk" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: /Buka halaman donasi/ })).toBeTruthy();
});
