import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PhotoField } from "@/components/admin/shared/PhotoField";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup(value = "") {
  const onChange = vi.fn();
  render(<PhotoField name="hero.url" label="Foto latar" value={value} srcset={[]} onChange={onChange} />);
  return { onChange };
}

describe("photo field", () => {
  it("only uploads a file: no link to paste, no choice between the two", () => {
    setup();
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
    expect(document.querySelector('input[type="url"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /Gunakan tautan|Unggah berkas/ })).toBeNull();
    expect((screen.getByLabelText("Foto latar") as HTMLInputElement).id).toBe("hero.url");
  });

  it("sends the chosen file to the optimiser and keeps the sizes it made", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { url: "https://cdn.test/a.jpg", srcset: [{ url: "https://cdn.test/a-640.webp", width: 640 }] } }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText("Foto latar"), { target: { files: [new File(["x"], "foto.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ url: "https://cdn.test/a.jpg", srcset: [{ url: "https://cdn.test/a-640.webp", width: 640 }] }));
    expect(await screen.findByText("Terunggah: foto.jpg")).toBeTruthy();
  });

  it("offers to remove a photo that is already set", () => {
    const { onChange } = setup("https://example.test/foto.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Hapus foto" }));
    expect(onChange).toHaveBeenCalledWith({ url: "", srcset: [] });
  });
});
