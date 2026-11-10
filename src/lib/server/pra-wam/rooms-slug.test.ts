import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { roomSlug } from "./rooms";

describe("roomSlug", () => {
  it("makes an address-safe key from the name, unique among the rooms", () => {
    expect(roomSlug("Ruang 4", [])).toBe("ruang-4");
    expect(roomSlug("Ruang 4", ["ruang-4"])).toBe("ruang-4-2");
    expect(roomSlug("Ruang 4", ["ruang-4", "ruang-4-2"])).toBe("ruang-4-3");
    expect(roomSlug("Café Ananta!", [])).toBe("cafe-ananta");
    expect(roomSlug("X", [])).toBe("x-ruang");
  });
});
