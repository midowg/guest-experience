import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LeadEditor } from "./LeadEditor";

afterEach(cleanup);
const options = { departments: ["Art & Creative Support", "Business & Administrative Services", "Center of Excellence"], businessUnits: ["Werkudara Nirwana Sakti"] };

describe("HOD departemen dan lead BU", () => {
  it("makes one person HOD of two departments (Sofyan: COE and ACS)", () => {
    const onSave = vi.fn();
    render(<LeadEditor name="Sofyan" value={{ departments: [], businessUnits: [] }} options={options} saving={false} disabled={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "HOD Center of Excellence: Sofyan" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "HOD Art & Creative Support: Sofyan" }));
    fireEvent.click(screen.getByRole("button", { name: "Simpan HOD dan lead BU" }));
    expect(onSave).toHaveBeenCalledWith({ departments: ["Center of Excellence", "Art & Creative Support"], businessUnits: [] });
  });

  it("adds a BU not listed yet and leads it (Yulia Mekar: HOD BAS, lead BU MRP)", () => {
    const onSave = vi.fn();
    render(<LeadEditor name="Yulia" value={{ departments: [], businessUnits: [] }} options={options} saving={false} disabled={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "HOD Business & Administrative Services: Yulia" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nama BU baru" }), { target: { value: "Maha Raja Pratama" } });
    fireEvent.click(screen.getByRole("button", { name: "Tambah BU" }));
    expect((screen.getByRole("checkbox", { name: "Lead BU Maha Raja Pratama: Yulia" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Simpan HOD dan lead BU" }));
    expect(onSave).toHaveBeenCalledWith({ departments: ["Business & Administrative Services"], businessUnits: ["Maha Raja Pratama"] });
  });

  it("locks everything for a BOD, with why", () => {
    render(<LeadEditor name="Bagus" value={{ departments: [], businessUnits: [] }} options={options} locked="BOD tidak bisa menjadi HOD departemen atau lead BU." saving={false} disabled={false} onSave={vi.fn()} />);
    expect(screen.getByText("BOD tidak bisa menjadi HOD departemen atau lead BU.")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "HOD Center of Excellence: Bagus" }) as HTMLInputElement).disabled).toBe(true);
  });
});
