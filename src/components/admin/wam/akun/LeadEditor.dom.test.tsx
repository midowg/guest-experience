import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LeadEditor } from "./LeadEditor";

afterEach(cleanup);
const options = { departments: ["Art & Creative Support", "Business & Administrative Services", "Center of Excellence"] };
const none = { departments: [], lead: false };

describe("HOD dan Lead", () => {
  it("makes one person HOD of two departments (Sofyan: COE and ACS)", () => {
    const onSave = vi.fn();
    render(<LeadEditor name="Sofyan" value={none} options={options} saving={false} disabled={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "HOD Center of Excellence: Sofyan" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "HOD Art & Creative Support: Sofyan" }));
    fireEvent.click(screen.getByRole("button", { name: "Simpan HOD dan Lead" }));
    expect(onSave).toHaveBeenCalledWith({ departments: ["Center of Excellence", "Art & Creative Support"], lead: false });
  });

  it("marks a Lead under the HOD (no Lead BU: nobody leads a business unit)", () => {
    const onSave = vi.fn();
    render(<LeadEditor name="Dimas" value={none} options={options} saving={false} disabled={false} onSave={onSave} />);
    expect(screen.queryByText(/Lead BU/)).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Lead: Dimas" }));
    fireEvent.click(screen.getByRole("button", { name: "Simpan HOD dan Lead" }));
    expect(onSave).toHaveBeenCalledWith({ departments: [], lead: true });
  });

  it("inside a larger form, reports each tick and has no save of its own", () => {
    const onChange = vi.fn();
    render(<LeadEditor name="Sofyan" value={none} options={options} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "HOD Center of Excellence: Sofyan" }));
    expect(onChange).toHaveBeenLastCalledWith({ departments: ["Center of Excellence"], lead: false });
    expect(screen.queryByRole("button", { name: "Simpan HOD dan Lead" })).toBeNull();
  });

  it("locks everything for a BOD, with why", () => {
    render(<LeadEditor name="Bagus" value={none} options={options} locked="BOD tidak bisa menjadi HOD atau Lead." saving={false} disabled={false} onSave={vi.fn()} />);
    expect(screen.getByText("BOD tidak bisa menjadi HOD atau Lead.")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "HOD Center of Excellence: Bagus" }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Lead: Bagus" }) as HTMLInputElement).disabled).toBe(true);
  });
});
