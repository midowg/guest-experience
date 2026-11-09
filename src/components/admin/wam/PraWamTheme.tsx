"use client";

import { useState } from "react";
import { Check, ExternalLink, Moon, Sun } from "lucide-react";
import { Notice } from "@/components/ui";
import { ConsoleButton, ConsoleButtonLink, PageHeader, type Crumb } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { WAM_LOOK_INFO, WAM_LOOKS, type WamLook } from "@/lib/pra-wam/theme";
import { praWamPath, praWamThemeApi } from "@/lib/routes";
import type { WamLookState } from "@/lib/server/pra-wam/theme";
import base from "@/components/pra-wam/pra-wam.module.css";
import css from "./theme-admin.module.css";

type Message = { tone: "success" | "error"; text: string } | null;

/** A small WAM screen in a theme and mode, drawn with the app's own tokens. */
function Preview({ look, mode }: { look: WamLook; mode: "light" | "dark" }) {
  return <div data-wam-look={look} data-wam-theme={mode} className={css.previewFrame}>
    <div className={`${base.app} ${css.preview}`}>
      <div className={css.hero}><span className={css.kicker}>Selamat malam</span><strong>Rani Pratiwi</strong></div>
      <div className={css.card}><span className={css.dot} /><span className={css.lines}><i /><i /></span></div>
      <div className={css.card}><span className={`${css.dot} ${css.dotBrass}`} /><span className={css.lines}><i /><i /></span></div>
      <span className={css.button}>Simpan</span>
      <span className={css.mode}>{mode === "dark" ? <Moon aria-hidden /> : <Sun aria-hidden />}{mode === "dark" ? "Gelap" : "Terang"}</span>
    </div>
  </div>;
}

/**
 * Admin WAM → Tema aplikasi (9 Nov 2026): the theme everyone sees in the WAM app. Each theme is
 * shown in light and dark, as the app draws them; each person still picks light or dark
 * themselves in Pengaturan → Tampilan (dark by default).
 */
export function PraWamTheme({ initial, migration, crumbs = [], title = "Tema aplikasi" }: { initial: WamLookState; migration: string; crumbs?: readonly Crumb[]; title?: string }) {
  const [state, setState] = useState(initial);
  const [choice, setChoice] = useState<WamLook>(initial.look);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function save() {
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest<WamLookState>(praWamThemeApi, { method: "PUT", body: JSON.stringify({ look: choice }) });
      if (result.data) { setState(result.data); setChoice(result.data.look); }
      setMessage({ tone: "success", text: result.message });
    } catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); }
    finally { setBusy(false); }
  }

  const locked = !state.migrated || busy;
  return <div className="stack">
    <PageHeader crumbs={crumbs} title={title}
      subtitle="Tema aplikasi WAM untuk semua orang. Terang atau gelap tetap dipilih masing-masing di Pengaturan → Tampilan; bawaannya gelap."
      actions={<>
        <ConsoleButtonLink href={praWamPath.home} target="_blank" rel="noopener" icon={<ExternalLink size={18} aria-hidden />}>Buka aplikasi WAM<span className="sr-only"> (tab baru)</span></ConsoleButtonLink>
        <ConsoleButton variant="primary" type="submit" form="theme-form" disabled={locked || choice === state.look}>{busy ? "Menyimpan…" : "Pakai tema ini"}</ConsoleButton>
      </>} />
    {!state.migrated && <Notice tone="warning">Tema aplikasi menunggu migrasi {migration}. Sampai saat itu semua orang melihat tema {WAM_LOOK_INFO.dream.label}, dan pilihan belum bisa disimpan.</Notice>}
    <div aria-live="polite">{message && <Notice tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>{message.text}</Notice>}</div>

    <form id="theme-form" noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset className={css.choices} disabled={locked}>
        <legend className="sr-only">Tema aplikasi</legend>
        {WAM_LOOKS.map(look => <label key={look} className={css.choice}>
          <input type="radio" name="look" value={look} className="sr-only" checked={choice === look} onChange={() => { setChoice(look); setMessage(null); }} />
          <span className={css.choiceHead}>
            <span className={css.choiceText}>
              <strong>{WAM_LOOK_INFO[look].label}</strong>
              <small>{WAM_LOOK_INFO[look].description}</small>
            </span>
            {state.look === look && <span className={css.inUse}>Dipakai sekarang</span>}
            <span className={css.check} aria-hidden><Check /></span>
          </span>
          <span className={css.previews}><Preview look={look} mode="dark" /><Preview look={look} mode="light" /></span>
        </label>)}
      </fieldset>
    </form>
  </div>;
}
