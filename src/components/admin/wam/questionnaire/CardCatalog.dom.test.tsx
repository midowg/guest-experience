import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AdminCards } from "@/lib/server/pra-wam/cards-admin";
import { CardCatalog } from "./CardCatalog";

const uploadArt = vi.fn(async () => undefined);
vi.mock("./cardArtUpload", () => ({ uploadArt: (...args: unknown[]) => uploadArt(...(args as [])) }));
vi.mock("@/components/admin/shared/api", async original => ({
  ...(await original<typeof import("@/components/admin/shared/api")>()),
  adminRequest: vi.fn(async () => ({ ok: true, data: null, message: "" })),
}));
afterEach(() => { cleanup(); uploadArt.mockClear(); });

const data: AdminCards = {
  catalog: {
    tiers: [{ key: "common", name: "Common", color: "#AEB7C7", odds: 10_000, maxCards: null, line: "", sort: 0 }],
    characters: [{ id: "00000000-0000-4000-8000-000000000001", number: 1, key: "penghibur", name: "Urban DJ", figure: "Jaka", class: "Bard Penghibur", title: "", description: "", powers: [], partnerId: null, hidden: false, rules: [], image: null, stored: false }],
    parts: [{ kind: "latar", number: 1, name: "Senja Ungu", image: null, stored: false }, { kind: "stiker", number: 12, name: "Logo W", image: null, stored: false }],
    figures: [], figuresReady: false,
  },
  questions: [], drawn: [], willChange: 0, following: false,
};

it("uploads every picked file whose name matches a slot, and says which were skipped", async () => {
  const { container } = render(<CardCatalog initial={data} />);
  const input = container.querySelector("input[type=file][multiple]") as HTMLInputElement;
  const file = (name: string) => new File(["x"], name, { type: name.endsWith(".webp") ? "image/webp" : "image/png" });
  fireEvent.change(input, { target: { files: [file("karakter-01.webp"), file("latar-01.png"), file("stiker-12.png"), file("foto-lain.png")] } });
  await waitFor(() => expect(screen.getByText(/3 gambar tersimpan\. 1 berkas dilewati/)).toBeTruthy());
  expect(uploadArt.mock.calls).toEqual([
    ["karakter", "00000000-0000-4000-8000-000000000001", expect.any(File)],
    ["latar", "1", expect.any(File)],
    ["stiker", "12", expect.any(File)],
  ]);
});
it("with tokoh cards, shows the characters as personas that cannot be deleted, uploads figures by key, and clears the old anime pictures", async () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  const { adminRequest } = await import("@/components/admin/shared/api");
  const figure = { id: "00000000-0000-4000-8000-0000000000f1", number: 1, key: "edmund-hillary", name: "Edmund Hillary", personaId: data.catalog.characters[0].id, costume: "", hobbies: [], activities: [], energy: "", genre: "", indonesian: false, funny: false, quote: null, hidden: false, image: "/figur/edmund-hillary.webp", stored: false };
  const tokoh: AdminCards = { ...data, catalog: { ...data.catalog, characters: [{ ...data.catalog.characters[0], image: "/x.webp", stored: true }], figures: [figure], figuresReady: true } };
  const { container } = render(<CardCatalog initial={tokoh} />);
  expect(screen.getByRole("heading", { name: "Persona (1)" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Tambah karakter/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Ubah Urban DJ/ }));
  expect(screen.queryByRole("button", { name: "Hapus" })).toBeNull();
  const input = container.querySelector("input[type=file][multiple]") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "edmund-hillary.png", { type: "image/png" })] } });
  await waitFor(() => expect(uploadArt).toHaveBeenCalledWith("tokoh", figure.id, expect.any(File)));
  fireEvent.click(screen.getByRole("button", { name: /Hapus gambar karakter lama/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Hapus gambar" }));
  await waitFor(() => expect(adminRequest).toHaveBeenCalledWith("/api/admin/wam/questionnaire/cards/art", { method: "DELETE" }));
});
