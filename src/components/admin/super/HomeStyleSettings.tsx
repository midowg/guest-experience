"use client";

import { useState, type CSSProperties } from "react";
import { Check, ExternalLink } from "lucide-react";
import { Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { HOME_STYLES, HOME_STYLE_MIGRATION, homeStyleLabels, type HomeStyle } from "@/lib/home-style";
import { HOME_STYLE_API } from "@/lib/routes";
import css from "./home-style.module.css";

/** A small drawing of each look, so the choice is seen and not only read. */
function Miniature({ style }: { style: HomeStyle }) {
  const tones = ["#2f6feb", "#e0457b", "#0d9488", "#ea580c", "#7c3aed"];
  if (style === "kartu") return <span className={css.miniKartu} aria-hidden="true">
    <span className={css.miniTitle} />
    <span className={css.miniFan}>{tones.map((tone, index) => <span key={tone} style={{ "--tone": tone, "--n": index - 2 } as CSSProperties} />)}</span>
  </span>;
  return <span className={css.miniLampu} aria-hidden="true">
    <span className={css.miniLamp} />
    <span className={css.miniTitle} />
    <span className={css.miniDock}>{tones.map(tone => <span key={tone} style={{ "--tone": tone } as CSSProperties} />)}</span>
  </span>;
}

/** Super admin → Halaman utama: pick the front page's look. Saved at once; the front page follows. */
export function HomeStyleSettings({ initial, migrated }: { initial: HomeStyle; migrated: boolean }) {
  const [style, setStyle] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function pick(next: HomeStyle) {
    if (busy || next === style) return;
    const before = style;
    setStyle(next); setBusy(true); setError(""); setMessage("");
    try {
      const result = await adminRequest<{ style: HomeStyle }>(HOME_STYLE_API, { method: "PUT", body: JSON.stringify({ style: next }) });
      setStyle(result.data?.style ?? next); setMessage(result.message);
    } catch (err) { setStyle(before); setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <div className={css.wrap} aria-busy={busy}>
    {!migrated && <Notice tone="warning">Pilihan tampilan menunggu migrasi <code>{HOME_STYLE_MIGRATION}</code>. Sampai itu, halaman utama memakai Kartu 3D.</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {message && <p role="status" className={css.status}>{message}</p>}
    <div className={css.options} role="radiogroup" aria-label="Tampilan halaman utama">
      {HOME_STYLES.map(key => <button key={key} type="button" role="radio" aria-checked={style === key} disabled={!migrated || busy} className={css.option} onClick={() => void pick(key)}>
        <Miniature style={key} />
        <span className={css.text}>
          <span className={css.name}>{homeStyleLabels[key].name}{style === key && <span className={css.badge}><Check size={14} aria-hidden="true" /> Dipakai</span>}</span>
          <span className={css.hint}>{homeStyleLabels[key].hint}</span>
        </span>
      </button>)}
    </div>
    <a className={css.open} href="/" target="_blank" rel="noopener">Buka halaman utama <ExternalLink size={14} aria-hidden="true" /></a>
  </div>;
}
