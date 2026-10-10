import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PhotoField } from "./PhotoField";

afterEach(cleanup);

function setup(value = "") {
  const onChange = vi.fn();
  render(<PhotoField name="hero.url" label="Foto latar" value={value} srcset={[]} onChange={onChange} />);
  return { onChange };
}
const uploadTab = () => screen.getByRole("button", { name: "Unggah berkas" });
const urlTab = () => screen.getByRole("button", { name: "Gunakan tautan" });

describe("switching between upload and link", () => {
  // React reuses a DOM node when two inputs share a position, which turned the
  // uncontrolled file field into the controlled URL field and warned in the console.
  it("does not warn about a controlled/uncontrolled switch", () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    setup();
    for (let round = 0; round < 3; round++) {
      fireEvent.click(urlTab());
      fireEvent.click(uploadTab());
    }
    const complaints = warn.mock.calls.map(args => String(args[0])).filter(message => /uncontrolled|controlled/i.test(message));
    warn.mockRestore();
    expect(complaints).toEqual([]);
  });

  it("renders a file input in upload mode and a URL input in link mode", () => {
    setup();
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
    expect(document.querySelector('input[type="url"]')).toBeNull();
    fireEvent.click(urlTab());
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(document.querySelector('input[type="url"]')).not.toBeNull();
  });

  it("keeps the URL field controlled from the first render", () => {
    setup("https://example.test/foto.jpg");
    fireEvent.click(urlTab());
    const input = document.querySelector('input[type="url"]') as HTMLInputElement;
    expect(input.value).toBe("https://example.test/foto.jpg");
  });

  it("reports a pasted link with no generated sizes", () => {
    const { onChange } = setup();
    fireEvent.click(urlTab());
    fireEvent.change(document.querySelector('input[type="url"]')!, { target: { value: "https://example.test/baru.jpg" } });
    expect(onChange).toHaveBeenCalledWith({ url: "https://example.test/baru.jpg", srcset: [] });
  });

  it("offers to clear a photo that is already set", () => {
    const { onChange } = setup("https://example.test/foto.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Kosongkan foto" }));
    expect(onChange).toHaveBeenCalledWith({ url: "", srcset: [] });
  });
});
