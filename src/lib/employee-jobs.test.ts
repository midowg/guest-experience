import { describe, expect, it } from "vitest";
import { departmentShort, employeeJobsSchema, jobsFromEmployee, leadsFromJobs, primaryFields, reconcileJobs, sameJobs, type EmployeeJob } from "./employees";

/* Pekerjaan karyawan (9 Nov 2026): the jobs of one person, the Utama one first. */

const person = { department: "Sales & Marketing", position: "Business Solutions Manager", business_unit: "WNS", reports_to: null };
const staf = (patch: Partial<EmployeeJob> = {}): EmployeeJob => ({ business_unit: "WNS", department: "Sales & Marketing", post: "staf", job_title: "Business Solutions Manager", reports_to: null, ...patch });

describe("jobsFromEmployee", () => {
  it("reads the Utama job from the person, then a job for every other department headed or led", () => {
    expect(jobsFromEmployee(person)).toEqual([staf()]);
    expect(jobsFromEmployee({ ...person, reports_to: "lead-1" })).toEqual([staf({ reports_to: "lead-1" })]);
    expect(jobsFromEmployee(person, { departments: ["Sales & Marketing", "Corporate"], lead: false })).toEqual([
      staf({ post: "hod" }),
      { business_unit: "WNS", department: "Corporate", post: "hod", job_title: "", reports_to: null },
    ]);
    // A Lead saved before Lead jobs leads their own department.
    expect(jobsFromEmployee(person, { departments: [], lead: true })[0].post).toBe("lead");
    expect(jobsFromEmployee(person, { departments: [], lead: true, leadIn: ["IT"] })).toEqual([staf(), { business_unit: "WNS", department: "IT", post: "lead", job_title: "", reports_to: null }]);
  });
});

describe("primaryFields", () => {
  it("copies the Utama job to the person's columns, the BU into the office unless HR's office is no BU code", () => {
    const jobs = [staf({ business_unit: "TEE", reports_to: "lead-1" }), staf({ business_unit: "MRP", department: "Finance", post: "hod", job_title: "" })];
    expect(primaryFields(jobs, "WNS")).toEqual({ department: "Sales & Marketing", position: "Business Solutions Manager", business_unit: "TEE", office: "TEE", reports_to: "lead-1" });
    expect(primaryFields(jobs, "").office).toBe("TEE");
    expect(primaryFields(jobs, "Jakarta").office).toBe("Jakarta");
    // A HOD or Lead without a title of its own reads "HOD Finance", and sits under nobody.
    expect(primaryFields([{ ...jobs[1], reports_to: "x" }], "")).toMatchObject({ position: "HOD Finance", reports_to: null, business_unit: "MRP" });
  });
});

describe("leadsFromJobs", () => {
  it("writes a HOD row per HOD job and a Lead row per Lead job", () => {
    expect(leadsFromJobs([staf({ post: "hod" }), staf({ department: "Corporate", post: "hod" }), staf({ department: "IT", post: "lead" }), staf({ department: "HC" })]))
      .toEqual({ departments: ["Corporate", "Sales & Marketing"], lead: true, leadIn: ["IT"] });
    expect(leadsFromJobs([staf()])).toEqual({ departments: [], lead: false, leadIn: [] });
  });
});

describe("reconcileJobs", () => {
  it("takes the Utama job from the person's columns (an import may have changed them)", () => {
    const rows = [staf({ department: "Old", job_title: "Old title" }), staf({ business_unit: "TEE", department: "Event", job_title: "Producer" })];
    expect(reconcileJobs(rows, { ...person, business_unit: "MRP" })).toEqual([staf({ business_unit: "MRP" }), rows[1]]);
  });

  it("follows pw_leads for HOD and Lead: gone becomes a Jabatan, new is added", () => {
    const rows = [staf({ post: "hod", job_title: "Head of Sales" }), staf({ business_unit: "TEE", department: "Event", post: "lead", job_title: "" })];
    const person2 = { ...person, position: "Head of Sales" };
    expect(reconcileJobs(rows, person2, { departments: ["Sales & Marketing"], lead: true, leadIn: ["Event"] })).toEqual(rows);
    const after = reconcileJobs(rows, person2, { departments: ["Corporate"], lead: false });
    expect(after.map(job => [job.department, job.post])).toEqual([["Sales & Marketing", "staf"], ["Event", "staf"], ["Corporate", "hod"]]);
  });

  it("keeps a HOD job without a title of its own without one", () => {
    const rows = [staf({ post: "hod", job_title: "" })];
    expect(reconcileJobs(rows, { ...person, position: "HOD Sales & Marketing" }, { departments: ["Sales & Marketing"], lead: false })[0].job_title).toBe("");
  });

  it("falls back to the person's columns without rows", () => {
    expect(reconcileJobs([], person)).toEqual([staf()]);
  });
});

describe("departmentShort", () => {
  it("shortens a department to its initials, small words in lower case, abbreviations kept whole", () => {
    expect(departmentShort("Center of Excellence")).toBe("CoE");
    expect(departmentShort("Business & Administrative Services")).toBe("BAS");
    expect(departmentShort("Takshaka Event & Experience")).toBe("TEE");
    expect(departmentShort("Human Resources & General Affair")).toBe("HRGA");
    expect(departmentShort("HR & GA")).toBe("HRGA");
    expect(departmentShort("Sales & Marketing")).toBe("SM");
    expect(departmentShort("Accounting")).toBe("Accounting");
    expect(departmentShort("  ")).toBe("");
  });
});

describe("employeeJobsSchema", () => {
  it("asks a Jabatan for its title, needs a department and at least one job", () => {
    expect(employeeJobsSchema.safeParse([staf()]).success).toBe(true);
    expect(employeeJobsSchema.safeParse([staf({ post: "hod", job_title: "" })]).success).toBe(true);
    const missing = employeeJobsSchema.safeParse([staf({ job_title: " " })]);
    expect(missing.success ? [] : missing.error.issues.map(issue => issue.message)).toEqual(["Isi nama jabatan."]);
    expect(employeeJobsSchema.safeParse([staf({ department: "" })]).success).toBe(false);
    expect(employeeJobsSchema.safeParse([]).success).toBe(false);
  });

  it("sameJobs ignores spaces and a reports_to on a HOD", () => {
    expect(sameJobs([staf({ department: " Sales & Marketing " })], [staf()])).toBe(true);
    expect(sameJobs([staf({ post: "hod", reports_to: "x" })], [staf({ post: "hod" })])).toBe(true);
    expect(sameJobs([staf()], [staf({ business_unit: "TEE" })])).toBe(false);
  });
});
