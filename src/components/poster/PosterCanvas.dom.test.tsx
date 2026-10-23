import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PosterCanvas } from "@/components/poster/PosterCanvas";
import { boxes, emptyPoster, posterSizes, type PosterBox, type PosterField, type PosterSettings, type PosterValues } from "@/lib/poster";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  // jsdom draws nothing; the layout falls back to an average character width.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const image = (url: string) => ({ url, alt: "", srcset: [] });
function item(key: string, label: PosterBox): PosterField {
  return {
    key, label: key.toUpperCase(), hint: "", kind: "text", editable: true, value: "", maxLength: 200, font: "nunito", weight: 400, tone: "", color: "#000000",
    align: "left", uppercase: false, letterSpacing: 0, sizeMax: 20, sizeMin: 20, lineHeight: 1, maxLines: 3, radius: 0, fill: "#ffffff",
    stack: "info", labelBox: { post: label }, box: boxes({ post: { x: 50, y: label.y + 30, w: 500, h: 20 } }),
  };
}
const base = emptyPoster();
const poster: PosterSettings = {
  ...base, formats: { ...base.formats, post: { ...base.formats.post, parts: ["a", "b"].map(key => ({ key, art: image(""), slot: image(""), label: image(`/label-${key}.png`) })) } },
  fields: [item("a", { x: 50, y: 100, w: 500, h: 30 }), item("b", { x: 50, y: 170, w: 500, h: 30 })],
};
const canvas = (values: PosterValues) => <PosterCanvas poster={poster} values={values} format="post" editing={false} hints={false} selected={null} onSelect={() => {}} onFrame={() => {}} fontsVersion={1} />;
const card = () => screen.getByRole("img", { name: /Poster Post/ });

it("draws a stacked item's heading only once it is filled, moved with the item", () => {
  const { rerender } = render(canvas({ text: { b: "Dua" }, photos: {} }));
  expect(card().querySelector("[data-label=a]")).toBeNull();
  // a is empty, so b and its heading take its place at the top of the stack.
  const moved = card().querySelector<HTMLElement>("[data-label=b]")!;
  expect([moved.style.top, moved.style.height]).toEqual(["100px", "30px"]);
  const picture = moved.querySelector("img")!;
  expect([picture.getAttribute("src"), picture.style.left, picture.style.top, picture.style.width]).toEqual(["/label-b.png", "-50px", "-170px", `${posterSizes.post.width}px`]);
  expect(card().querySelector<HTMLElement>("[data-field=b]")!.style.top).toBe("130px");

  rerender(canvas({ text: { a: "Satu", b: "Dua" }, photos: {} }));
  expect(card().querySelector<HTMLElement>("[data-label=a]")!.style.top).toBe("100px");
  expect(card().querySelector<HTMLElement>("[data-label=b]")!.style.top).toBe("170px");
  expect(card().querySelector<HTMLElement>("[data-field=b]")!.style.top).toBe("200px");
});
