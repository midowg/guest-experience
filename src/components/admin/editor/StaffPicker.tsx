"use client";

import { StaffAvatar } from "@/components/admin/shared/StaffAvatar";
import { contactFromStaff } from "@/lib/staff";
import type { EventContact, StaffMember } from "@/lib/types";
import styles from "@/components/admin/admin.module.css";

/** One tap fills the PIC from Tim Werkudara: name, role, WhatsApp number and photo. */
export function StaffPicker({ staff, contact, onPick }: { staff: StaffMember[]; contact: EventContact; onPick: (contact: EventContact) => void }) {
  if (!staff.length) return <p className="field-hint">Daftar Tim Werkudara masih kosong. Super admin bisa mengisinya di Dashboard super admin › Tim Werkudara, supaya PIC tinggal dipilih.</p>;
  return <div className={styles.picPicker} role="group" aria-labelledby="pic-picker-title">
    <p id="pic-picker-title">Pilih PIC dari tim</p>
    <ul className={styles.picOptions}>
      {staff.map(person => <li key={person.id}>
        <button type="button" className={styles.picOption} aria-pressed={contact.staff_id === person.id} onClick={() => onPick(contactFromStaff(contact, person))}>
          <StaffAvatar person={person} size={40} />
          <span><strong>{person.name}</strong>{person.role && <small>{person.role}</small>}</span>
        </button>
      </li>)}
    </ul>
  </div>;
}
