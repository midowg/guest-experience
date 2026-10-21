import { expect, it } from "vitest";
import { createSeedEvent } from "./seed-event";
import { contactFromStaff, initials } from "./staff";

const raka = { id: "5f000000-0000-4000-8000-000000000001", name: "Raka Pratama", role: "Hospitality", phone: "0812 3456 7890", photo: { url: "https://foto.example/raka.webp", alt: "", srcset: [] }, active: true, sort_order: 0 };

it("fills the PIC from a team member and keeps the admin's intro text", () => {
  const contact = { ...createSeedEvent().contact, heading: "Ada pertanyaan?", channel: "phone" as const };
  expect(contactFromStaff(contact, raka)).toEqual({
    ...contact, name: "Raka Pratama", role: "Hospitality", phone: "0812 3456 7890", organization: "Werkudara", channel: "whatsapp",
    photo: { url: "https://foto.example/raka.webp", alt: "Raka Pratama", srcset: [] }, staff_id: raka.id,
  });
  expect(contactFromStaff(contact, { ...raka, photo: { url: "", alt: "", srcset: [] } }).photo).toEqual({ url: "", alt: "", srcset: [] });
});

it("makes two-letter initials", () => {
  expect(initials("Raka Pratama")).toBe("RP");
  expect(initials("  sari ")).toBe("S");
  expect(initials("Ni Made Ayu Lestari")).toBe("NL");
});
