"use client";

import { useState } from "react";
import { KeyRound, LifeBuoy } from "lucide-react";
import type { Contact } from "@/lib/main-wam/peserta/contact";
import type { RoomPerson } from "@/lib/main-wam/types";
import { useT } from "@/components/main-wam/i18n";
import { ScreenContent } from "@/components/main-wam/shell";
import { Avatar, BracketCard, Button, Card, EmptyState } from "@/components/main-wam/ui";
import { ContactSheet } from "../ContactSheet";
import css from "../peserta.module.css";

export type RoomProps = {
  /** HR's room, everyone in it (any number); null before HR publishes the rooms. */
  room: { name: string; sub: string; note: string; people: RoomPerson[] } | null;
  stay: { checkIn: string; checkOut: string };
  roomHelp: Contact | null;
};

/**
 * Kamar (L01; the kelompok are gone from the app, revisi 18 Nov): the room card (everyone in it,
 * you marked; check-in and check-out; Bantuan kamar). Not published yet: says so in place of the card.
 */
export function RoomScreen({ room, stay, roomHelp }: RoomProps) {
  const t = useT();
  const [calling, setCalling] = useState(false);
  return <ScreenContent>
    {room
      ? <BracketCard as="section" motif="konstelasi" className={css.room} aria-label={t("peserta.room.room", { name: room.name })}>
        <div className={css.roomTop}>
          <div className={css.groupHeadBlock}>
            <h2 className={css.roomTitle}>{t("peserta.room.room", { name: room.name })}</h2>
            <span className={css.roomSub}>{room.sub}</span>
          </div>
          <span className={css.roomKey} aria-hidden><KeyRound /></span>
        </div>
        <ul className={css.members} aria-label={t("peserta.room.residents", { name: room.name, n: room.people.length })}>
          {room.people.map(person => <li key={person.id} className={css.member}>
            <Avatar name={person.name} size={32} />
            <span className={css.memberText}><span className={css.memberName}>{person.me ? t("peserta.room.you", { name: person.name }) : person.name}</span><span className={css.memberDept}>{person.department}</span></span>
          </li>)}
        </ul>
        {room.note && <p className={css.roomNote}>{room.note}</p>}
        {(stay.checkIn || stay.checkOut) && <>
          <hr className={css.roomDivider} />
          <div className={css.roomDates}>
            {stay.checkIn && <div className={css.roomDate}><span className={css.roomDateLabel}>{t("peserta.room.checkIn")}</span><span className={css.roomDateValue}>{stay.checkIn}</span></div>}
            {stay.checkOut && <div className={css.roomDate}><span className={css.roomDateLabel}>{t("peserta.room.checkOut")}</span><span className={css.roomDateValue}>{stay.checkOut}</span></div>}
          </div>
        </>}
        {roomHelp && <Button variant="secondary" size="m" icon={<LifeBuoy />} className={css.roomButton} onClick={() => setCalling(true)}>{t("peserta.room.roomHelp")}</Button>}
      </BracketCard>
      : <Card><EmptyState size="s" icon={<KeyRound />} title={t("peserta.room.roomWaiting")}>{t("peserta.room.waiting")}</EmptyState></Card>}
    {roomHelp && <ContactSheet contact={roomHelp} title={t("peserta.room.roomHelp")} open={calling} onClose={() => setCalling(false)} />}
  </ScreenContent>;
}
