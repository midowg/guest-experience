"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, Bus, CalendarClock, ChevronRight, Map as MapIcon, MapPin, Phone, TrainFront } from "lucide-react";
import type { Contact } from "@/lib/main-wam/peserta/contact";
import type { TravelStep } from "@/lib/main-wam/peserta/travel";
import type { TripDirection, TripKind } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";
import { useT } from "@/components/main-wam/i18n";
import { ScreenContent } from "@/components/main-wam/shell";
import { Avatar, Banner, Button, Card, EmptyState, Segmented } from "@/components/main-wam/ui";
import { ContactSheet } from "../ContactSheet";
import css from "../peserta.module.css";

const MARK: Record<TripKind, typeof MapPin> = { kumpul: MapPin, kereta: TrainFront, bus: Bus, tiba: Building2, lain: MapPin };

export type TravelProps = {
  initial: TripDirection;
  labels: Record<TripDirection, string>;
  steps: Record<TripDirection, TravelStep[]>;
  coordinators: Partial<Record<TripDirection, Contact>>;
  changed: Partial<Record<TripDirection, string>>;
  migrated: boolean;
};

/**
 * Perjalanan (L03, revisi 16 Nov): Berangkat and Pulang (the segmented switches at once, both are
 * here), the steps as a line (kumpul with "Buka peta", the train as a ticket with the person's
 * coach and seat, the shuttle with their bus, arriving at the hotel to Kelompok & kamar), a changed
 * gathering time on top, and the coordinator to call.
 */
export function TravelScreen({ initial, labels, steps, coordinators, changed, migrated }: TravelProps) {
  const t = useT();
  const [direction, setDirection] = useState<TripDirection>(initial);
  const [calling, setCalling] = useState(false);
  const list = steps[direction];
  const coordinator = coordinators[direction] ?? null;
  return <ScreenContent>
    {changed[direction] && <Banner tone="warning" icon={<CalendarClock />} title={changed[direction]} />}
    <Segmented label={t("peserta.travel.direction")} value={direction} onChange={value => setDirection(value as TripDirection)}
      options={[{ value: "berangkat", label: labels.berangkat }, { value: "pulang", label: labels.pulang }]} />
    {!migrated || !list.length
      ? <Card><EmptyState size="s" icon={<TrainFront />} title={t("peserta.travel.empty")}>{t("peserta.group.waiting")}</EmptyState></Card>
      : <ol className={css.stepper} aria-label={t(direction === "berangkat" ? "peserta.travel.stepsOut" : "peserta.travel.stepsBack")}>
        {list.map(step => {
          const Mark = MARK[step.kind];
          return <li key={step.id} className={css.step}>
            <span className={css.stepMark} aria-hidden><Mark /></span>
            <div className={css.stepBody}>
              {step.toRoom
                ? <Link href={mainWamPath.groupRoom} className={css.stepLink}>
                  <span><span className={css.stepTitle}>{step.title}</span>{step.sub && <span className={css.stepSub}>{step.sub}</span>}</span>
                  <ChevronRight aria-hidden />
                </Link>
                : <>
                  <span className={css.stepTitle}>{step.title}</span>
                  {step.line && <span className={css.stepLine}>{step.line}</span>}
                  {step.sub && <span className={css.stepSub}>{step.sub}</span>}
                  {step.ticket && <Card className={css.ticket} aria-label={t("peserta.travel.ticket", { from: step.ticket.from, to: step.ticket.to })}>
                    <div className={css.ticketRoute}>
                      <div className={css.ticketStop}><span className={css.ticketCity}>{step.ticket.from}</span><span className={css.ticketTime}>{step.ticket.depart}</span></div>
                      <div className={css.ticketMid} aria-hidden><span className={css.ticketTrack}><TrainFront /></span>{step.ticket.duration && <span className={css.ticketDur}>{step.ticket.duration}</span>}</div>
                      <div className={`${css.ticketStop} ${css.ticketStopEnd}`}><span className={css.ticketCity}>{step.ticket.to}</span><span className={css.ticketTime}>{step.ticket.arrive}</span></div>
                    </div>
                    {step.ticket.cols.length > 0 && <>
                      <hr className={css.ticketTear} />
                      <dl className={css.ticketCols}>
                        {step.ticket.cols.map(col => <div key={col.label} className={css.ticketCol}><dt className={css.ticketLabel}>{col.label}</dt><dd className={css.ticketValue}>{col.value}</dd></div>)}
                      </dl>
                    </>}
                    {step.ticket.note && <p className={css.ticketNote}>{step.ticket.note}</p>}
                  </Card>}
                  {step.mapUrl && <Button variant="text" size="m" icon={<MapIcon />} href={step.mapUrl} external className={css.stepAction}>{t("peserta.travel.map")}</Button>}
                </>}
            </div>
          </li>;
        })}
      </ol>}
    {coordinator && <Card>
      <div className={css.personRow}>
        <Avatar name={coordinator.name} photo={coordinator.photo} />
        <span className={css.personText}><span className={css.personName}>{coordinator.name}</span><span className={css.personRole}>{t("peserta.travel.coordinator")}</span></span>
        <Button variant="secondary" size="m" icon={<Phone />} onClick={() => setCalling(true)} aria-label={t("peserta.session.contactName", { name: coordinator.name })}>{t("peserta.session.contact")}</Button>
      </div>
    </Card>}
    {coordinator && <ContactSheet contact={coordinator} title={t("peserta.travel.contactCoordinator")} open={calling} onClose={() => setCalling(false)} />}
  </ScreenContent>;
}
