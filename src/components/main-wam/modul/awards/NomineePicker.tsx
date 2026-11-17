"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { ScreenContent } from "@/components/main-wam/shell";
import { ActionBar, Avatar, Banner, Button, PhotoFill, useToast } from "@/components/main-wam/ui";
import { when, type NomineeView } from "@/lib/main-wam/modul/awards";
import { mainWamApi, mainWamPath } from "@/lib/routes";
import { errorText, modulRequest } from "../request";
import css from "../modul.module.css";

/**
 * V02 Pilih nominasi: one choice per category, secret, changeable until it closes. Oneself (and
 * one's own photos) is not offered; the server refuses it anyway. Kirim → back to V01 with a toast.
 */
export function NomineePicker({ category, nominees, current, now, preview }: {
  category: { id: string; title: string; description: string; closesAt: string };
  nominees: NomineeView[];
  current: string | null;
  now: Date;
  /** dev-preview: a choice already made on screen. */
  preview?: { choice?: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const id = useId();
  const [choice, setChoice] = useState<string | null>(preview?.choice ?? current);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!choice || sending) return;
    setSending(true); setError(null);
    try {
      await modulRequest(mainWamApi.vote(category.id), { method: "PUT", json: { nomineeId: choice } });
      toast.show({ text: "Pilihanmu terkirim.", tone: "success" });
      router.push(mainWamPath.awards);
      router.refresh();
    } catch (problem) {
      setError(errorText(problem));
      setSending(false);
    }
  }

  return <>
    <ScreenContent>
      <div>
        <h2 className={css.cardTitle}>{category.title}</h2>
        {category.description && <p className={css.lead}>{category.description}</p>}
        <p className={css.secret}><Lock aria-hidden />{`Rahasia. Bisa diubah sampai ${when(category.closesAt, now)}.`}</p>
      </div>
      {error && <Banner tone="error">{error}</Banner>}
      <fieldset className={css.choices} aria-describedby={`${id}-hint`}>
        <legend className="sr-only" id={`${id}-hint`}>{`Pilih satu nominasi ${category.title}`}</legend>
        {nominees.map(nominee => <label key={nominee.id} className={css.choice}>
          <input type="radio" name={`${id}-pilih`} value={nominee.id} checked={choice === nominee.id} onChange={() => setChoice(nominee.id)} className={css.choiceInput} />
          {nominee.kind === "foto"
            ? <span className={css.choicePhoto}><PhotoFill photo={nominee.image ? { src: nominee.image, alt: `Foto ${nominee.name}` } : null} className={css.fillBox} /></span>
            : nominee.kind === "orang" ? <Avatar name={nominee.name} photo={nominee.photo} size={40} /> : null}
          <span className={css.choiceText}>
            <span className={css.choiceName}>{nominee.kind === "foto" ? `Foto ${nominee.name}` : nominee.name}</span>
            {nominee.department && <span className={css.choiceMeta}>{nominee.department}</span>}
            {nominee.reason && <span className={css.choiceMeta}>{nominee.reason}</span>}
          </span>
          <span className={css.radio} aria-hidden />
        </label>)}
      </fieldset>
    </ScreenContent>
    <ActionBar note={!choice ? "Pilih satu dulu." : undefined}>
      <Button block disabled={!choice || choice === current} loading={sending} loadingLabel="Mengirim…" onClick={() => void send()}>Kirim</Button>
    </ActionBar>
  </>;
}
