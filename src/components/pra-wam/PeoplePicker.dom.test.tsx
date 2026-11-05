import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PeoplePicker } from "./PeoplePicker";

afterEach(cleanup);

const people = [{ id: "p1", name: "Budi", department: "IT" }, { id: "p2", name: "Citra", department: "IT" }, { id: "p3", name: "Ayu", department: "HR" }];
const groups = [{ id: "hr", label: "HR", memberIds: ["p3", "me"] }, { id: "it", label: "IT", memberIds: ["p1", "p2"] }];
const names = () => [...screen.getByRole("list", { name: "Pilih partisipan" }).querySelectorAll("strong")].map(item => item.textContent);

it("opens on the viewer's own department from their profile, and Semua departemen shows everyone", () => {
  render(<PeoplePicker people={people} groups={groups} picked={[]} onChange={() => undefined} viewerId="me" />);
  expect((screen.getByLabelText("Departemen") as HTMLSelectElement).value).toBe("hr");
  expect(names()).toEqual(["Ayu"]);
  fireEvent.change(screen.getByLabelText("Departemen"), { target: { value: "" } });
  expect(names()).toEqual(["Ayu", "Budi", "Citra"]);
});

it("stops adding at the limit but still lets a picked person go", () => {
  const onChange = vi.fn();
  render(<PeoplePicker people={people} groups={groups} picked={["p1"]} onChange={onChange} max={1} />);
  expect((screen.getByRole("button", { name: /^Citra/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /^Budi/ }));
  expect(onChange).toHaveBeenCalledWith([]);
});
