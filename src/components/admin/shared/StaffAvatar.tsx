import { initials } from "@/lib/staff";
import type { StaffMember } from "@/lib/types";
import styles from "@/components/admin/admin.module.css";

/** A team member's photo, or their initials on a soft circle. */
export function StaffAvatar({ person, size = 44 }: { person: Pick<StaffMember, "name" | "photo">; size?: number }) {
  const small = person.photo.srcset?.[0]?.url;
  return person.photo.url
    // eslint-disable-next-line @next/next/no-img-element -- stored photos with their own sizes
    ? <img className={styles.staffAvatar} src={small || person.photo.url} alt="" width={size} height={size} style={{ width: size, height: size }} />
    : <span className={styles.staffAvatar} aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials(person.name)}</span>;
}
