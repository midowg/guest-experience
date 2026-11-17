import "server-only";
import { parseContactPhone } from "@/lib/contact-phone";
import type { PanitiaContact } from "@/lib/main-wam/modul/contact";
import type { MainWamSettings, MwSession } from "@/lib/main-wam/types";
import { createPrivilegedClient } from "../../supabase/admin";
import { personOf } from "../people";

export type { PanitiaContact };

/** The session's own contact, else the panitia desk of the event (settings.contacts.umum); null when none is set. */
export async function panitiaContact(settings: Pick<MainWamSettings, "contacts">, session?: Pick<MwSession, "contactId"> | null): Promise<PanitiaContact | null> {
  const id = session?.contactId ?? settings.contacts.umum;
  if (!id) return null;
  const [person, phone] = await Promise.all([
    personOf(id),
    createPrivilegedClient().from("employees").select("phone").eq("id", id).maybeSingle().then(({ data }) => (data as { phone: string } | null)?.phone ?? "", () => ""),
  ]);
  if (!person) return null;
  const parsed = parseContactPhone(phone);
  return { name: person.name, role: "Panitia acara", photo: person.photo ?? null, local: parsed?.local ?? null, international: parsed?.international ?? null };
}
