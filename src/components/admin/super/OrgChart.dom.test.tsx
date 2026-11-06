import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { buildOrg } from "@/lib/org";
import { OrgChart } from "./OrgChart";

afterEach(cleanup);

describe("Struktur", () => {
  it("draws the BOD, the Chief of Staff, then each department with its HOD and branches", () => {
    const org = buildOrg([
      { id: "bagus", name: "I Gusti Putu Yaktianuraga", position: "Managing Director", department: "Corporate", businessUnit: "WNS", reportsTo: null },
      { id: "fadli", name: "Fadli Fahmi Ali", position: "Chief Executive Officer", department: "Corporate", businessUnit: "WNS", reportsTo: null },
      { id: "adiel", name: "Adiel Priyarama", position: "Chief of Staff", department: "Corporate", businessUnit: "WNS", reportsTo: null },
      { id: "gm", name: "Gita", position: "General Manager", department: "Sales & Marketing", businessUnit: "WNS", reportsTo: null },
      { id: "bsm", name: "Budi", position: "Business Solutions Manager", department: "Sales & Marketing", businessUnit: "WNS", reportsTo: null },
      { id: "eng", name: "Eko", position: "Commercial Engineer", department: "Sales & Marketing", businessUnit: "WNS", reportsTo: "bsm" },
    ], new Set(["bagus", "fadli"]), { "Sales & Marketing": ["gm"] }, ["MRP", "WNS", "TEE", "NMU", "WNN"]);
    render(<OrgChart org={org} />);
    expect(within(screen.getByRole("region", { name: "BOD" })).getByText("Fadli Fahmi Ali")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Kantor direksi" })).getByText("Chief of Staff")).toBeTruthy();
    const sales = within(screen.getByRole("article", { name: "Sales & Marketing" }));
    expect(sales.getByText("HOD")).toBeTruthy();
    expect(sales.getByText("3 orang")).toBeTruthy();
    // Eko sits in Budi's branch, one level down.
    const budi = sales.getByText("Budi").closest("li")!;
    expect(within(budi).getByText("Eko")).toBeTruthy();
  });
});
