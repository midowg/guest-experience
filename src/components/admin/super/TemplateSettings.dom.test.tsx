import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TemplateSettings } from "@/components/admin/super/TemplateSettings";
import { templateKeys } from "@/lib/event-templates";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows every template with its miniature and saves which ones admins see", async () => {
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify({ ok: true, data: JSON.parse(init!.body as string), message: "3 templat tersedia untuk admin biasa." }), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  render(<TemplateSettings initialEnabled={["kunjungan-klien", "trip-klien"]} migrated />);
  expect(screen.getAllByRole("switch")).toHaveLength(templateKeys.length);
  expect((screen.getByRole("switch", { name: "Kunjungan Kantor tampil untuk admin" }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole("switch", { name: "Nyadran tampil untuk admin" }) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole("switch", { name: "Nyadran tampil untuk admin" }));
  fireEvent.click(screen.getByRole("button", { name: /Simpan pengaturan templat/ }));
  expect(await screen.findByText("3 templat tersedia untuk admin biasa.")).toBeTruthy();
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).enabled.sort()).toEqual(["kunjungan-klien", "nyadran", "trip-klien"]);
});
