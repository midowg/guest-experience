import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { boxes, posterPalettes, type PosterField } from "@/lib/poster";
import { PosterInspector } from "./PosterInspector";

afterEach(cleanup);

// "Yang akan Anda lakukan" as the JCWF flyer has it: three points, 2.4 line height, a 90 px box.
const points: PosterField = {
  key: "yang_akan_dilakukan", label: "Yang akan Anda lakukan", hint: "", kind: "text", editable: true, value: "", maxLength: 300,
  font: "inter", weight: 500, tone: "", color: "#383838", align: "left", uppercase: false, letterSpacing: 0,
  sizeMax: 20, sizeMin: 12, lineHeight: 2.4, maxLines: 4, radius: 0, fill: "#ffffff", list: true,
  box: boxes({ post: { x: 735, y: 345, w: 317, h: 90 } }),
};
const show = (field: PosterField, shown?: { size: number; lines: number }) => {
  const onChange = vi.fn();
  render(<PosterInspector field={field} index={0} formats={["post"]} palette={posterPalettes[0]} errors={{}} shown={shown && { format: "post", ...shown }} onChange={onChange} onRemove={() => {}} onClose={() => {}} />);
  return onChange;
};

it("says when the box holds the type below its set size, and grows the box to fit on request", () => {
  const onChange = show(points, { size: 12.5, lines: 3 });
  expect(screen.getByRole("status").textContent).toMatch(/Tampil 13, bukan 20/);
  expect(screen.getByRole("status").textContent).toMatch(/3 baris × jarak baris 2,4/);
  fireEvent.click(screen.getByRole("button", { name: "Tinggikan kotak agar muat" }));
  // Three lines at 20 px with 2.4 spacing: 144 px.
  expect(onChange.mock.calls[0][0].box.post).toEqual({ x: 735, y: 345, w: 317, h: 144 });
});

it("explains a stacked item held by its panel, without offering a taller box", () => {
  show({ ...points, list: false, stack: "info" }, { size: 15, lines: 2 });
  expect(screen.getByRole("status").textContent).toMatch(/panel ini mengecilkan semua isinya bersama/);
  expect(screen.queryByRole("button", { name: "Tinggikan kotak agar muat" })).toBeNull();
});

it("says nothing while the type shows at its set size", () => {
  show(points, { size: 20, lines: 3 });
  expect(screen.queryByText(/Tampil/)).toBeNull();
});
