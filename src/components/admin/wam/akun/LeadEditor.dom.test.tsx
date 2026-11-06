import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LeadEditor } from "./LeadEditor";

afterEach(cleanup);
const options = { departments: ["Art & Creative Support", "Business & Administrative Services", "Center of Excellence"], businessUnits: ["MRP", "WNS", "TEE", "NMU", "WNN"] };

describe("HOD departemen dan lead BU", () => {
  it("makes one person HOD of two departments (Sofyan: COE and ACS)", () => {
    const onSave = vi.fn();
    render(<LeadEditor name="Sofyan" value={{ departments: [], businessUnits: [] }} options={options} saving={false} disabled={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "HOD Center of Excellence: Sofyan" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "HOD Art & Creative Support: Sofyan" }));
    fireEvent.click(screen.getByRole("button", { name: "Simpan HOD dan lead BU" }));
    expect(onSave).toHaveBeenCalledWith({ departments: ["Center of Excellence", "Art & Creative Support"], businessUnits: [] });
  });

  it("makes Yulia Mekar HOD of BAS and lead of BU MRP", () => {
    const onSave = vi.fn();
    render(<LeadEditor name="Yulia" value={{ departments: [], businessUnits: [] }} options={options} saving={false} disabled={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "HOD Business & Administrative Services: Yulia" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Lead BU MRP: Yulia" }));
    fireEvent.click(screen.getByRole("button", { name: "Simpan HOD dan lead BU" }));
    expect(onSave).toHaveBeenCalledWith({ departments: ["Business & Administrative Services"], businessUnits: ["MRP"] });
  });

  it("inside a larger form, reports each tick and has no save of its own", () => {
    const onChange = vi.fn();
    render(<LeadEditor name="Sofyan" value={{ departments: [], businessUnits: [] }} options={options} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "HOD Center of Excellence: Sofyan" }));
    expect(onChange).toHaveBeenLastCalledWith({ departments: ["Center of Excellence"], businessUnits: [] });
    expect(screen.queryByRole("button", { name: "Simpan HOD dan lead BU" })).toBeNull();
  });

  it("locks everything for a BOD, with why", () => {
    render(<LeadEditor name="Bagus" value={{ departments: [], businessUnits: [] }} options={options} locked="BOD tidak bisa menjadi HOD departemen atau lead BU." saving={false} disabled={false} onSave={vi.fn()} />);
    expect(screen.getByText("BOD tidak bisa menjadi HOD departemen atau lead BU.")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "HOD Center of Excellence: Bagus" }) as HTMLInputElement).disabled).toBe(true);
  });
});
