import type { EventContact, StaffMember } from "./types";

/**
 * The event contact after picking a team member: name, role, number and photo from the team list,
 * Werkudara as organisation, WhatsApp as channel. The intro text the admin wrote stays.
 */
export function contactFromStaff(contact: EventContact, person: StaffMember): EventContact {
  return {
    ...contact,
    name: person.name, role: person.role, phone: person.phone, organization: "Werkudara", channel: "whatsapp",
    photo: person.photo.url ? { ...person.photo, alt: person.photo.alt || person.name } : { url: "", alt: "", srcset: [] },
    staff_id: person.id,
  };
}

/** Two letters for an avatar without a photo: "Raka Pratama" → "RP". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}
