import "server-only";
import { contactLinks, type Contact } from "@/lib/main-wam/peserta/contact";
import { createPrivilegedClient } from "../../supabase/admin";
import { mainWamPeople } from "../people";

/*
 * The people the event names as contacts (a trip's coordinator, a session's panitia, Admin WAM's
 * kamar/perjalanan/umum), with their number from Data karyawan. Only these ids are read: nobody
 * else's number ever reaches a page. One query for all of them; a failure leaves the numbers out
 * (the name still shows, without Telepon/WhatsApp).
 */

export async function contactsOf(wanted: readonly { id: string | null | undefined; role: string }[]): Promise<Map<string, Contact>> {
  const ids = [...new Set(wanted.map(entry => entry.id).filter((id): id is string => !!id && /^[0-9a-f-]{36}$/i.test(id)))];
  const out = new Map<string, Contact>();
  if (!ids.length) return out;
  const [people, phones] = await Promise.all([
    mainWamPeople().catch(() => new Map()),
    (async () => {
      try {
        const { data, error } = await createPrivilegedClient().from("employees").select("id,phone").in("id", ids).limit(ids.length);
        return error ? new Map<string, string>() : new Map((data ?? []).map(row => [row.id as string, (row.phone as string | null) ?? ""]));
      } catch { return new Map<string, string>(); }
    })(),
  ]);
  for (const entry of wanted) {
    if (!entry.id || out.has(entry.id)) continue;
    const person = people.get(entry.id);
    if (!person) continue;
    out.set(entry.id, { id: person.id, name: person.name, role: entry.role, photo: person.photo ?? null, ...contactLinks(phones.get(entry.id)) });
  }
  return out;
}

/** One contact, or null. */
export async function contactOf(id: string | null | undefined, role: string): Promise<Contact | null> {
  if (!id) return null;
  return (await contactsOf([{ id, role }])).get(id) ?? null;
}
