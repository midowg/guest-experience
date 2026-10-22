import { expect, it } from "vitest";
import { areaOfBlock, blockOfArea, isPreviewMessage, phaseOfBlock } from "./live-preview";

it("maps guest page parts and editor blocks both ways", () => {
  expect(blockOfArea.location).toBe("venue");
  expect(areaOfBlock("venue")).toBe("location");
  expect(areaOfBlock("gallery")).toBe("location");
  expect(areaOfBlock("schedule")).toBe("hero");
  expect(areaOfBlock("publication")).toBeNull();
});

it("shows the day and after panels for their blocks", () => {
  expect(phaseOfBlock("day")).toBe("day");
  expect(phaseOfBlock("review")).toBe("after");
  expect(phaseOfBlock("contact")).toBe("before");
});

it("recognises only preview messages", () => {
  expect(isPreviewMessage({ type: "preview:ready" })).toBe(true);
  expect(isPreviewMessage({ type: "hero:ready" })).toBe(false);
  expect(isPreviewMessage("preview:ready")).toBe(false);
});
