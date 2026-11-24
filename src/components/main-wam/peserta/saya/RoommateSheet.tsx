"use client";

import { useEffect, useState } from "react";
import { IdCard, UserRound } from "lucide-react";
import type { RoommateView } from "@/lib/main-wam/peserta/roommate";
import type { RoomPerson } from "@/lib/main-wam/types";
import { useT } from "@/components/main-wam/i18n";
import { Avatar, Banner, EmptyState, EyebrowLabel, Sheet, Skeleton, SkeletonGroup } from "@/components/main-wam/ui";
import { failText } from "../request";
import css from "./roommate.module.css";

/**
 * A roommate's profile (Kamar, L01): opens at once with the head (name, department, photo) from the room
 * list, a Skeleton where the rest will be, then the answers they marked "Rekan bisa lihat ini". A failed
 * load says so with "Coba lagi"; what was loaded stays in `views` (the screen's) for the next opening.
 */
export function RoommateSheet({ person, view, onLoaded, load, onClose }: {
  person: RoomPerson;
  view: RoommateView | undefined;
  onLoaded: (view: RoommateView) => void;
  load: (id: string) => Promise<RoommateView>;
  onClose: () => void;
}) {
  const t = useT();
  const [failure, setFailure] = useState<{ id: string; attempt: number; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (view) return;
    let live = true;
    load(person.id).then(
      loaded => { if (live) onLoaded(loaded); },
      error => { if (live) setFailure({ id: person.id, attempt, message: failText(error) }); },
    );
    return () => { live = false; };
  }, [person.id, view, attempt, load, onLoaded]);
  const failed = !view && failure?.id === person.id && failure.attempt === attempt ? failure : null;
  const shown = view?.person ?? person;
  const first = shown.name.split(" ")[0];

  return <Sheet open onClose={onClose} title={t("peserta.room.profile")} hideTitle>
    <div className={css.sheetStack}>
      <div className={css.mateHead}>
        <Avatar name={shown.name} photo={shown.photo} size={48} />
        <span className={css.personText}><span className={css.memberName}>{shown.name}</span>{shown.department && <span className={css.memberDept}>{shown.department}</span>}</span>
      </div>
      {failed
        ? <Banner tone="error" title={t("peserta.room.loadFailed")} action={{ label: t("shell.retry"), onClick: () => setAttempt(value => value + 1) }}>{failed.message}</Banner>
        : !view
          ? <SkeletonGroup label={t("peserta.room.loadingProfile")} className={css.sheetStack}>
            <Skeleton shape="block" height={64} />
            <Skeleton width="40%" />
            <Skeleton width="85%" />
            <Skeleton width="60%" />
            <Skeleton width="85%" />
          </SkeletonGroup>
          : !view.filled
            ? <EmptyState size="s" icon={<UserRound />} title={t("peserta.room.noQuestionnaire")}>{t("peserta.room.noQuestionnaireBody", { name: first })}</EmptyState>
            : <>
              {view.card && <section className={css.mateCard} aria-label={t("peserta.room.card")}>
                <EyebrowLabel icon={<IdCard />}>{t("peserta.room.card")}</EyebrowLabel>
                <p className={css.mateCardName}>{view.card.name}</p>
                <p className={css.mateCardSub}>{[view.card.kind, view.card.tier].filter(Boolean).join(" · ")}</p>
              </section>}
              <section className={css.sheetStack} aria-label={t("peserta.room.know")}>
                <EyebrowLabel as="h3" large>{t("peserta.room.know")}</EyebrowLabel>
                {view.answers.length === 0
                  ? <p className={css.textMuted}>{t("peserta.room.noAnswers")}</p>
                  : <dl className={css.mateAnswers}>
                    {view.answers.map(answer => <div key={answer.key} className={css.mateAnswer}>
                      <dt className={css.mateAsk}>{answer.prompt}</dt>
                      <dd className={css.mateReply}>
                        {answer.lines.length > 1 ? <ul className={css.mateReply}>{answer.lines.map(line => <li key={line}>{line}</li>)}</ul> : answer.lines[0]}
                      </dd>
                    </div>)}
                  </dl>}
                <p className={css.mateNote}>{t("peserta.room.shared")}</p>
              </section>
            </>}
    </div>
  </Sheet>;
}
