"use client";

import { useId, useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import type { Contact } from "@/lib/main-wam/peserta/contact";
import type { LineupItem } from "@/lib/main-wam/types";
import { Avatar, Button, IconBox } from "@/components/main-wam/ui";
import { ContactSheet } from "../ContactSheet";
import css from "../peserta.module.css";
import list from "./info.module.css";

/**
 * "Info lainnya" in Detail sesi (P04, P04__status#info): a row that folds open (closed by default)
 * with Urutan tampil, Konsumsi and Kontak panitia ("Hubungi" opens the contact sheet). A real
 * button with aria-expanded; the content is in the page, only hidden.
 */
export function InfoLainnya({ sub, lineup, meal, contact, defaultOpen = false }: { sub: string; lineup: LineupItem[]; meal: string; contact: Contact | null; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [calling, setCalling] = useState(false);
  const id = useId();
  return <>
    <div className={list.item}>
      <button type="button" className={list.row} aria-expanded={open} aria-controls={`${id}-isi`} onClick={() => setOpen(!open)}>
        <IconBox icon={<Info />} />
        <span className={list.text}><span className={list.title}>Info lainnya</span>{!open && <span className={list.sub}>{sub}</span>}</span>
        <ChevronDown aria-hidden className={`${list.chevron} ${css.disclosureChevron}`} data-open={open || undefined} />
      </button>
      <div id={`${id}-isi`} className={css.disclosureBody} hidden={!open}>
        {lineup.length > 0 && <div className={css.kvStack}>
          <h3 className={css.disclosureLabel}>Urutan tampil</h3>
          {lineup.map((item, index) => <div key={`${item.time}-${index}`} className={css.kv}><span className={css.kvTime}>{item.time}</span><span className={css.kvValue}>{item.label}</span></div>)}
        </div>}
        {meal && <div className={css.kvStack}>
          <h3 className={css.disclosureLabel}>Konsumsi</h3>
          <p className={css.text}>{meal}</p>
        </div>}
        {contact && <div className={css.kvStack}>
          <h3 className={css.disclosureLabel}>Kontak panitia</h3>
          <div className={css.personRow}>
            <Avatar name={contact.name} photo={contact.photo} />
            <span className={css.personName}>{contact.name}</span>
            <Button variant="text" size="m" onClick={() => setCalling(true)} aria-label={`Hubungi ${contact.name}`}>Hubungi</Button>
          </div>
        </div>}
      </div>
    </div>
    {contact && <ContactSheet contact={contact} title="Hubungi panitia" open={calling} onClose={() => setCalling(false)} />}
  </>;
}
