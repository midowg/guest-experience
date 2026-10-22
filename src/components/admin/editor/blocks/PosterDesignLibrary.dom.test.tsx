import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PosterDesignLibrary } from "@/components/admin/editor/blocks/PosterDesignLibrary";
import { presetPoster } from "@/lib/poster-presets";
import { createSeedEvent } from "@/lib/seed-event";
import type { PosterDesign } from "@/lib/poster";
import { posterDesignInputSchema } from "@/lib/validation";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const poster = presetPoster("rempah-nusantara", createSeedEvent());
const saved: PosterDesign = { id: "4b0f0000-0000-4000-8000-000000000001", name: "JCWF sesi kuliner", description: "", template: { preset: poster.preset, formats: poster.formats, fields: poster.fields.slice(0, 2) }, created_at: "2026-10-22T00:00:00Z" };

it("lets any admin start from a saved design, without the save or delete controls", () => {
  const onApply = vi.fn();
  render(<PosterDesignLibrary poster={poster} initial={[saved]} superAdmin={false} onApply={onApply} />);
  fireEvent.click(screen.getByRole("button", { name: "Pakai desain ini" }));
  expect(onApply).toHaveBeenCalledWith(saved);
  expect(screen.queryByText("Simpan sebagai desain baru")).toBeNull();
  expect(screen.queryByRole("button", { name: /Hapus desain/ })).toBeNull();
});

it("saves the poster on screen as a design for the super admin", async () => {
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(init!.body as string);
    return new Response(JSON.stringify({ ok: true, data: { ...saved, id: "4b0f0000-0000-4000-8000-000000000002", name: body.name }, message: "Desain poster disimpan ke pustaka." }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetch);
  render(<PosterDesignLibrary poster={poster} initial={[]} superAdmin onApply={() => {}} />);
  fireEvent.click(screen.getByText("Simpan sebagai desain baru"));
  fireEvent.change(screen.getByRole("textbox", { name: "Nama desain" }), { target: { value: "Rempah JCWF" } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan ke pustaka" }));
  await waitFor(() => expect(screen.getByText("Desain poster disimpan ke pustaka.")).toBeTruthy());
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe("/api/admin/poster-designs");
  const body = JSON.parse(init!.body as string);
  expect(posterDesignInputSchema.safeParse(body).success).toBe(true);
  expect(body.template.fields).toHaveLength(poster.fields.length);
  expect(body.template).not.toHaveProperty("enabled");
  expect(screen.getByText("Rempah JCWF")).toBeTruthy();
});

it("refuses a design without a name or without boxes", () => {
  expect(posterDesignInputSchema.safeParse({ name: "A", template: saved.template }).success).toBe(false);
  expect(posterDesignInputSchema.safeParse({ name: "Kosong", template: { ...saved.template, fields: [] } }).success).toBe(false);
});
