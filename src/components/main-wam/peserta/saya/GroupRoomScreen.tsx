"use client";

import { useState } from "react";
import { Bus, ChevronDown, ChevronUp, Images, KeyRound, LifeBuoy, Users, Utensils } from "lucide-react";
import type { Contact } from "@/lib/main-wam/peserta/contact";
import { MEMBERS_SHOWN, type ActivityRow, type MemberRow } from "@/lib/main-wam/peserta/saya";
import type { ActivityGroupKind, RoomPerson } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";
import { useT } from "@/components/main-wam/i18n";
import { ScreenContent, ScreenSection } from "@/components/main-wam/shell";
import { Avatar, Button, Card, EmptyState, List, ListRow, SectionHeader } from "@/components/main-wam/ui";
import { ContactSheet } from "../ContactSheet";
import css from "../peserta.module.css";

const ACTIVITY_ICON: Record<ActivityGroupKind, typeof Users> = { pos: Users, angkot: Bus, meja: Utensils, lain: Users };

export type GroupRoomProps = {
  /** HR's room, everyone in it (any number); null before HR publishes the rooms. */
  room: { name: string; sub: string; note: string; people: RoomPerson[] } | null;
  stay: { checkIn: string; checkOut: string };
  group: { title: string; size: number; members: MemberRow[] } | null;
  groupsPublished: boolean;
  activities: ActivityRow[];
  roomHelp: Contact | null;
};

/**
 * Kelompok & kamar (L01, revisi 16 Nov malam): the room card (everyone in it, you marked; check-in
 * and check-out; Bantuan kamar), the kelompok (coordinator first, five shown, "5 lainnya" for the
 * rest, Galeri of the kelompok), and the kelompok kegiatan (post, minibus, table) per session.
 * Not published yet: says so in place of the card.
 */
export function GroupRoomScreen({ room, stay, group, groupsPublished, activities, roomHelp }: GroupRoomProps) {
  const t = useT();
  const [all, setAll] = useState(false);
  const [calling, setCalling] = useState(false);
  const members = group ? (all ? group.members : group.members.slice(0, MEMBERS_SHOWN)) : [];
  const rest = group ? group.members.length - MEMBERS_SHOWN : 0;
  return <ScreenContent>
    {room
      ? <section className={css.room} aria-label={t("peserta.group.room", { name: room.name })}>
        <div className={css.roomTop}>
          <div className={css.groupHeadBlock}>
            <h2 className={css.roomTitle}>{t("peserta.group.room", { name: room.name })}</h2>
            <span className={css.roomSub}>{room.sub}</span>
          </div>
          <span className={css.roomKey} aria-hidden><KeyRound /></span>
        </div>
        <ul className={css.members} aria-label={t("peserta.group.residents", { name: room.name, n: room.people.length })}>
          {room.people.map(person => <li key={person.id} className={css.member}>
            <Avatar name={person.name} size={32} />
            <span className={css.memberText}><span className={css.memberName}>{person.me ? t("peserta.group.you", { name: person.name }) : person.name}</span><span className={css.memberDept}>{person.department}</span></span>
          </li>)}
        </ul>
        {room.note && <p className={css.roomNote}>{room.note}</p>}
        {(stay.checkIn || stay.checkOut) && <>
          <hr className={css.roomDivider} />
          <div className={css.roomDates}>
            {stay.checkIn && <div className={css.roomDate}><span className={css.roomDateLabel}>{t("peserta.group.checkIn")}</span><span className={css.roomDateValue}>{stay.checkIn}</span></div>}
            {stay.checkOut && <div className={css.roomDate}><span className={css.roomDateLabel}>{t("peserta.group.checkOut")}</span><span className={css.roomDateValue}>{stay.checkOut}</span></div>}
          </div>
        </>}
        {roomHelp && <Button variant="secondary" size="m" icon={<LifeBuoy />} className={css.roomButton} onClick={() => setCalling(true)}>{t("peserta.group.roomHelp")}</Button>}
      </section>
      : <Card><EmptyState size="s" icon={<KeyRound />} title={t("peserta.group.roomWaiting")}>{t("peserta.group.waiting")}</EmptyState></Card>}

    {group
      ? <Card as="article">
        <div className={css.groupHeadBlock}><h2 className={css.groupTitle}>{group.title}</h2><span className={css.groupSize}>{t("fmt.people", { n: group.size })}</span></div>
        <ul id="anggota-kelompok" className={css.members} aria-label={t("peserta.group.members", { title: group.title })}>
          {members.map(member => <li key={member.id} className={css.member}>
            <Avatar name={member.name} photo={member.photo} size={32} />
            <span className={css.memberText}><span className={css.memberName}>{member.label}</span><span className={css.memberDept}>{member.department}</span></span>
          </li>)}
        </ul>
        <hr className={css.cardDivider} />
        <div className={css.groupFoot}>
          {rest > 0
            ? <Button variant="text" size="m" icon={all ? <ChevronUp /> : <ChevronDown />} onClick={() => setAll(!all)} aria-expanded={all} aria-controls="anggota-kelompok">{all ? t("peserta.group.less") : t("peserta.group.more", { n: rest })}</Button>
            : <span />}
          <Button variant="text" size="m" icon={<Images />} href={mainWamPath.gallery({ lihat: "kelompok" })}>{t("peserta.group.gallery")}</Button>
        </div>
      </Card>
      : <Card><EmptyState size="s" icon={<Users />} title={groupsPublished ? t("peserta.group.notIn") : t("peserta.group.notPublished")}>
        {groupsPublished ? t("peserta.group.askCommittee") : t("peserta.group.waiting")}
      </EmptyState></Card>}

    {activities.length > 0 && <ScreenSection>
      <SectionHeader title={t("peserta.group.activities")} />
      <List>
        {activities.map(row => {
          const Icon = ACTIVITY_ICON[row.kind];
          return <ListRow key={row.id} icon={<Icon />} title={row.title} sub={row.sub} href={mainWamPath.session(row.sessionId)} />;
        })}
      </List>
    </ScreenSection>}
    {roomHelp && <ContactSheet contact={roomHelp} title={t("peserta.group.roomHelp")} open={calling} onClose={() => setCalling(false)} />}
  </ScreenContent>;
}
