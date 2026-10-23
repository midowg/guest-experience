import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PosterFieldList } from "./PosterFieldList";
import { presetPoster } from "@/lib/poster-presets";
import { createSeedEvent } from "@/lib/seed-event";

afterEach(cleanup);

it("turns a guest's text box into a list of points, with room for several", () => {
  const fields = presetPoster("rempah-nusantara", createSeedEvent()).fields;
  const title = { ...fields.find(field => field.key === "title")!, editable: true, list: false, maxLines: 2 };
  const onChange = vi.fn();
  const { rerender } = render(<PosterFieldList fields={[title]} onChange={onChange} />);
  fireEvent.click(screen.getByRole("checkbox", { name: `${title.label} poin-poin` }));
  expect(onChange).toHaveBeenLastCalledWith("title", { ...title, list: true, maxLines: 6 });

  // Off again keeps the lines the admin set; a locked box and a photo get no such choice.
  rerender(<PosterFieldList fields={[{ ...title, list: true, maxLines: 4 }, { ...title, key: "locked", label: "Tetap", editable: false }, { ...fields.find(field => field.kind === "photo")!, editable: true }]} onChange={onChange} />);
  fireEvent.click(screen.getByRole("checkbox", { name: `${title.label} poin-poin` }));
  expect(onChange).toHaveBeenLastCalledWith("title", { ...title, list: false, maxLines: 4 });
  expect(screen.getAllByRole("checkbox", { name: /poin-poin/ })).toHaveLength(1);
});

it("says which boxes their stack places", () => {
  const fields = presetPoster("rempah-nusantara", createSeedEvent()).fields;
  render(<PosterFieldList fields={[{ ...fields[0], stack: "info" }, { ...fields[1], key: "lain" }]} onChange={vi.fn()} />);
  expect(screen.getAllByText("Tersusun otomatis")).toHaveLength(1);
});
