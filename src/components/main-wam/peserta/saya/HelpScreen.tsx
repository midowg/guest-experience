"use client";

import { useState } from "react";
import { CalendarDays, House, Images, MessageCircle } from "lucide-react";
import type { MessageKey } from "@/lib/main-wam/i18n";
import { useT } from "@/components/main-wam/i18n";
import type { Contact } from "@/lib/main-wam/peserta/contact";
import { mainWamPath } from "@/lib/routes";
import { ScreenContent, ScreenSection } from "@/components/main-wam/shell";
import { Avatar, Button, Card, EyebrowLabel, IconBox, List, ListRow, TextLink } from "@/components/main-wam/ui";
import { ContactSheet } from "../ContactSheet";
import css from "../peserta.module.css";

/** Pertanyaan umum: short, in the words of the screens ("Absen", "Momen", "Notifikasi"). */
const questions = [
  { id: "absen", title: "peserta.help.q.absen.title", text: "peserta.help.q.absen.text" },
  { id: "momen", title: "peserta.help.q.momen.title", text: "peserta.help.q.momen.text" },
  { id: "notifikasi", title: "peserta.help.q.notif.title", text: "peserta.help.q.notif.text" },
  { id: "layar-utama", title: "peserta.help.q.install.title", text: "peserta.help.q.install.text" },
] as const satisfies readonly { id: string; title: MessageKey; text: MessageKey }[];

/**
 * Bantuan (a page of its own under Saya, not a sheet): a short how-to, a few common questions and
 * the panitia contact. The contact opens "Hubungi panitia" in a sheet, as elsewhere in the app.
 */
export function HelpScreen({ help }: { help: Contact | null }) {
  const t = useT();
  const [calling, setCalling] = useState(false);
  return <ScreenContent>
    <ScreenSection>
      <EyebrowLabel as="h2">{t("peserta.help.howTo")}</EyebrowLabel>
      <Card>
        <ul className={css.bullets}>
          <li><IconBox icon={<House />} />{t("peserta.help.howHome")}</li>
          <li><IconBox icon={<CalendarDays />} />{t("peserta.help.howAgenda")}</li>
          <li><IconBox icon={<Images />} />{t("peserta.help.howMoments")}</li>
        </ul>
      </Card>
    </ScreenSection>
    <ScreenSection>
      <EyebrowLabel as="h2">{t("peserta.help.faq")}</EyebrowLabel>
      <Card>
        <dl className={css.faq}>
          {questions.map(item => <div key={item.id} className={css.faqItem}>
            <dt className={css.faqQuestion}>{t(item.title)}</dt>
            <dd className={css.faqAnswer}>{t(item.text)}</dd>
          </div>)}
        </dl>
        <TextLink href={mainWamPath.settings} chevron>{t("peserta.help.openSettings")}</TextLink>
      </Card>
    </ScreenSection>
    {help && <ScreenSection>
      <EyebrowLabel as="h2">{t("peserta.help.stillNeed")}</EyebrowLabel>
      <List>
        <ListRow leading={<Avatar name={help.name} photo={help.photo} />} title={help.name} sub={help.role} chevron={false}
          trailing={<Button variant="secondary" size="m" icon={<MessageCircle />} onClick={() => setCalling(true)} aria-label={t("peserta.session.contactName", { name: help.name })}>{t("peserta.session.contact")}</Button>} />
      </List>
    </ScreenSection>}
    {help && <ContactSheet contact={help} title={t("peserta.session.contactCommittee")} open={calling} onClose={() => setCalling(false)} />}
  </ScreenContent>;
}
