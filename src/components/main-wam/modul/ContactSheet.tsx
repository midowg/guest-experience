"use client";

import { MessageCircle, Phone } from "lucide-react";
import { useKnown, useT } from "@/components/main-wam/i18n";
import { Avatar, Button, Sheet } from "@/components/main-wam/ui";
import type { PanitiaContact } from "@/lib/main-wam/modul/contact";
import css from "./modul.module.css";

/**
 * "Hubungi panitia" (A04__status; also A01, A05 and P04): the session's panitia, Telepon and
 * WhatsApp. Without a number the buttons are left out and the sheet says where to go instead.
 */
export function ContactSheet({ open, onClose, contact }: { open: boolean; onClose: () => void; contact: PanitiaContact | null }) {
  const t = useT();
  const known = useKnown();
  return <Sheet open={open} onClose={onClose} title={t("absen.contactTitle")}>
    {contact ? <>
      <div className={css.contactWho}>
        <Avatar name={contact.name} photo={contact.photo} size={64} />
        <div>
          <p className={css.contactName}>{contact.name}</p>
          <p className={css.contactRole}>{known(contact.role)}</p>
        </div>
      </div>
      {contact.local && contact.international
        ? <div className={css.contactRow}>
          <Button variant="secondary" icon={<Phone />} href={`tel:${contact.local}`} external>{t("absen.call")}</Button>
          <Button variant="secondary" icon={<MessageCircle />} href={`https://wa.me/${contact.international}`} external>{t("absen.whatsapp")}</Button>
        </div>
        : <p className={css.contactNote}>{t("absen.findCommittee")}</p>}
    </> : <p className={css.contactNote}>{t("absen.findCommittee")}</p>}
  </Sheet>;
}
