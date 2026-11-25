import { expect, it } from "vitest";
import { firstName, opensGaMode, processorLabel } from "./access";

it("opens Mode GA for the GA group, Admin Booking and holders of the Coffee grant only", () => {
  expect(opensGaMode({ category: "karyawan", roles: [], holdsCoffee: false })).toBe(false);
  expect(opensGaMode({ category: "intern", roles: ["panitia", "bod", "admin"], holdsCoffee: false })).toBe(false);
  expect(opensGaMode({ category: "dw", roles: [], holdsCoffee: false })).toBe(true);
  expect(opensGaMode({ category: "karyawan", roles: ["ga"], holdsCoffee: false })).toBe(true);
  expect(opensGaMode({ category: "karyawan", holdsCoffee: true })).toBe(true);
  expect(opensGaMode({ holdsCoffee: false })).toBe(false);
});

it("names the processor by nickname, and the super admin as Super admin", () => {
  expect(processorLabel({ name: "Contoh Dewi Lestari", nickname: "Dewi" })).toBe("Dewi");
  expect(processorLabel({ name: "Dewi Lestari", nickname: " " })).toBe("Dewi");
  expect(processorLabel({ name: "Siapa Saja", nickname: "Dewi", superAdmin: true })).toBe("Super admin");
  expect(processorLabel({})).toBe("Admin");
  expect(firstName("  Rina Putri ")).toBe("Rina");
});
