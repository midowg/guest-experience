"use client";

import { MessageCircle, Phone } from "lucide-react";
import type { Contact } from "@/lib/main-wam/peserta/contact";
import { useT } from "@/components/main-wam/i18n";
import { Avatar, Button, Sheet } from "@/components/main-wam/ui";
import css from "./peserta.module.css";

/**
 * "Hubungi koordinator" (P02__status#kontak, from L03), "Hubungi panitia" (P04, Bantuan), "Bantuan
 * kamar" (L01): who it is and two ways to reach them, a call and WhatsApp. Without a number on
 * file: where to find them instead.
 */
export function ContactSheet({ contact, title, open, onClose }: { contact: Contact; title: string; open: boolean; onClose: () => void }) {
  const t = useT();
  const reachable = !!(contact.tel || contact.whatsapp);
  return <Sheet open={open} onClose={onClose} title={title}
    footer={reachable ? <div className={css.buttonRow}>
      {contact.tel && <Button variant="secondary" icon={<Phone />} href={contact.tel} external={false}>{t("peserta.contact.call")}</Button>}
      {contact.whatsapp && <Button variant="secondary" icon={<MessageCircle />} href={contact.whatsapp} external>WhatsApp</Button>}
    </div> : undefined}>
    <div className={css.sheetStack}>
      <div className={css.sheetPerson}>
        <Avatar name={contact.name} photo={contact.photo} />
        <span className={css.personText}><span className={css.personName}>{contact.name}</span><span className={css.personRole}>{contact.role}</span></span>
      </div>
      {!reachable && <p className={css.textMuted}>{t("peserta.contact.noNumber")}</p>}
    </div>
  </Sheet>;
}
