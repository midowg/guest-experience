import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProfilePhoto } from "./ProfilePhoto";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }) }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); refresh.mockReset(); });

const camera = () => screen.getByRole("button", { name: "Ganti foto profil" });

it("shows initials without a photo, and no camera when it is not editable", () => {
  render(<ProfilePhoto name="Bagus Werkudara" photo={null} />);
  expect(screen.getByRole("img", { name: "Bagus Werkudara" }).textContent).toBe("BW");
  expect(screen.queryByRole("button", { name: "Ganti foto profil" })).toBeNull();
});

it("opens a menu with only Pilih foto when there is no photo; Esc closes it and returns focus", () => {
  render(<ProfilePhoto name="Bagus Werkudara" photo={null} editable />);
  expect(camera().getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(camera());
  expect(camera().getAttribute("aria-expanded")).toBe("true");
  const items = screen.getAllByRole("menuitem");
  expect(items.map(item => item.textContent)).toEqual(["Pilih foto"]);
  expect(document.activeElement).toBe(items[0]);
  fireEvent.keyDown(items[0], { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(camera());
});

it("offers Hapus foto with a photo, confirms first, then deletes and refreshes", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, data: null, message: "Foto profil dihapus." }), { status: 200 }));
  render(<ProfilePhoto name="Bagus Werkudara" photo="/api/wam/photo/p1?v=1" editable />);
  expect(screen.getByRole("img", { name: "Bagus Werkudara" }).getAttribute("src")).toBe("/api/wam/photo/p1?v=1");
  fireEvent.click(camera());
  expect(screen.getAllByRole("menuitem").map(item => item.textContent)).toEqual(["Pilih foto", "Hapus foto"]);
  fireEvent.click(screen.getByRole("menuitem", { name: "Hapus foto" }));

  // Batal leaves the photo alone.
  fireEvent.click(await screen.findByRole("button", { name: "Batal" }));
  expect(fetch).not.toHaveBeenCalled();

  fireEvent.click(camera());
  fireEvent.click(screen.getByRole("menuitem", { name: "Hapus foto" }));
  fireEvent.click(await screen.findByRole("button", { name: "Hapus foto" }));
  await waitFor(() => expect(screen.getByText("Foto profil dihapus.")).toBeTruthy());
  expect(fetch).toHaveBeenCalledWith("/api/wam/photo", expect.objectContaining({ method: "DELETE" }));
  expect(refresh).toHaveBeenCalled();
  // Initials until the refreshed page arrives.
  expect(screen.getByRole("img", { name: "Bagus Werkudara" }).textContent).toBe("BW");
});

it("says in plain words when the picked file is not a photo", async () => {
  const { container } = render(<ProfilePhoto name="Bagus Werkudara" photo={null} editable />);
  const input = container.querySelector<HTMLInputElement>("input[type=file]")!;
  fireEvent.change(input, { target: { files: [new File(["x"], "catatan.pdf", { type: "application/pdf" })] } });
  expect((await screen.findByRole("alert")).textContent).toBe("Pilih foto JPG, PNG, WebP, atau HEIC.");
});
