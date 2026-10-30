import { afterEach, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { smTdnYogyakarta } from "@/lib/fixtures/sm-tdn-yogyakarta";
import { EventPreview } from "./EventPreview";

afterEach(cleanup);

it("shows the page's opening: label, title, date range, place and cover photo", () => {
  const event = { ...smTdnYogyakarta(), hero: { ...smTdnYogyakarta().hero, url: "https://example.test/cover.webp", srcset: [{ width: 480, url: "https://example.test/cover-480.webp" }] } };
  const { container } = render(<EventPreview event={event} />);
  expect(container.textContent).toContain("Panduan peserta");
  expect(container.textContent).toContain("SM RO Jakarta TDN Yogyakarta");
  expect(container.textContent).toContain("5–8 November 2026");
  expect(container.textContent).toContain("THE 1O1 Yogyakarta Tugu");
  expect(container.querySelector("img")?.getAttribute("src")).toBe("https://example.test/cover-480.webp");
});

it("shows only the start date when the end is not a later day", () => {
  const event = { ...smTdnYogyakarta(), ends_at: "2026-11-04T10:00:00+07:00" };
  const { container } = render(<EventPreview event={event} />);
  expect(container.textContent).not.toContain("–");
  expect(container.textContent).toContain("5 November 2026");
});
