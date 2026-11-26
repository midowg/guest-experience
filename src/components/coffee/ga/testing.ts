import { act } from "@testing-library/react";
import { vi } from "vitest";
import { SETTLE_MS } from "./parts";

/* Shared by the tablet's tests: the clock is held still (only Date and the intervals: testing-library waits on real timeouts), and a screen is given the moment it takes before it listens. */
export const NOW = "2026-11-26T03:00:00.000Z";
/** Longer than the moment a new screen ignores presses (see useSettled). */
export const rest = () => act(() => { vi.advanceTimersByTime(SETTLE_MS + 50); });
