import { expect, it } from "vitest";
import { latestFridaySharing } from "./friday-sharing";

it("opens the Friday Sharing dated latest, falling back to when it was made", () => {
  const events = [
    { id: "a", starts_at: "2026-10-23T02:00:00.000Z", created_at: "2026-10-01T00:00:00.000Z" },
    { id: "b", starts_at: "2026-10-30T02:00:00.000Z", created_at: "2026-10-02T00:00:00.000Z" },
    { id: "c", starts_at: "", created_at: "2026-10-20T00:00:00.000Z" },
  ];
  expect(latestFridaySharing(events)?.id).toBe("b");
  expect(latestFridaySharing([events[0], events[2]])?.id).toBe("a");
  expect(latestFridaySharing([{ id: "d", starts_at: "", created_at: "2026-10-05T00:00:00.000Z" }, events[2]])?.id).toBe("c");
  expect(latestFridaySharing([])).toBeNull();
});
