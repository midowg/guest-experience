/**
 * Meeting rooms GA takes orders in (owner's list, 2 Nov 2026), each with its spot on the office
 * floor plan of Pra WAM (src/lib/pra-wam/floor-plan.ts). "Lainnya" is typed in and has no spot.
 */
export const ROOMS = [
  { name: "CFC Ananta Room", spot: "ananta" },
  { name: "Kaliya Limasan", spot: "limasan" },
  { name: "Vasuki Room", spot: "vasuki" },
  { name: "Komunal Space", spot: "communal" },
] as const;
export const OTHER_ROOM = "Lainnya";
/** Where the JumpStart machine stands. */
export const MACHINE_SPOT = "pantry";
