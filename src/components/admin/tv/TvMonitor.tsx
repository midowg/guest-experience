"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, RotateCw } from "lucide-react";
import { Notice } from "@/components/ui";
import { ConsoleButton, ConsoleButtonLink, PageHeader, Pill, SectionToolbar, StatCard, StatRow, type Crumb } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import akun from "@/components/admin/wam/akun/akun.module.css";
import css from "@/components/admin/wam/tv-admin.module.css";
import { agoLabel, tvIsOn } from "@/lib/pra-wam/tv";
import { absolute, praWamTvApi, TV_HOME_PATH, tvAdminPath, tvPath } from "@/lib/routes";
import type { TvAdmin, TvScreen } from "@/lib/server/pra-wam/tv";

/** How often the page asks again while it is open: a TV asks every ten seconds itself. */
const REFRESH_MS = 15_000;

function state(screen: TvScreen, now: number): { label: string; tone: "ok" | "warn" | "neutral" } {
  if (!screen.lastSeenAt) return { label: "Belum pernah dibuka", tone: "neutral" };
  return tvIsOn(screen.lastSeenAt, now) ? { label: "Menyala", tone: "ok" } : { label: "Tidak terlihat", tone: "warn" };
}

/**
 * Admin TV → Pantauan: which TV is on, when it was last seen, how big its screen is, what it says
 * it is showing, and a way to make it load its page afresh from here. The page asks again by
 * itself every fifteen seconds. A TV that opened the one address for all (/tv) is not listed: it
 * has no name to be known by.
 */
export function TvMonitor({ initial, crumbs, title, origin }: { initial: TvAdmin; crumbs: readonly Crumb[]; title: string; origin: string }) {
  const [list, setList] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const now = Date.parse(list.now);

  useEffect(() => {
    if (!initial.migrated) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void adminRequest<TvAdmin>(praWamTvApi.list).then(result => { if (result.data) setList(result.data); }, () => undefined);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [initial.migrated]);

  async function run(tag: string, url: string, init: RequestInit) {
    setBusy(tag); setMessage(null);
    try {
      const result = await adminRequest<TvAdmin>(url, init);
      if (result.data) setList(result.data);
      setMessage({ tone: "success", text: result.message });
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(null); }
  }

  const on = list.screens.filter(screen => tvIsOn(screen.lastSeenAt, now)).length;
  const playing = list.items?.filter(item => item.active).length ?? null;
  return <>
    <PageHeader crumbs={crumbs} title={title} subtitle="TV mana yang menyala dan sedang menayangkan apa. Halaman ini memperbarui diri tiap 15 detik."
      actions={list.migrated ? <>
        <ConsoleButton icon={<RefreshCw size={18} aria-hidden />} disabled={!!busy} onClick={() => void run("refresh", praWamTvApi.list, {})}>{busy === "refresh" ? "Memuat…" : "Muat ulang"}</ConsoleButton>
        <ConsoleButtonLink href={tvAdminPath.preview} target="_blank" rel="noopener" variant="primary" icon={<ExternalLink size={18} aria-hidden />}>Pratinjau</ConsoleButtonLink>
      </> : undefined} />
    {!list.migrated ? <Notice tone="warning">TV Announcement menunggu migrasi 202611100003_pw_tv.sql. Jalankan di Supabase SQL Editor.</Notice> : <>
      <div aria-live="polite">{message && <Notice tone={message.tone}>{message.text}</Notice>}</div>
      <StatRow label="Angka penting">
        <StatCard label="TV menyala" value={`${on}/${list.screens.length}`} tone={list.screens.length > 0 && on === 0 ? "warn" : undefined} note={list.screens.length ? "dari TV yang punya alamat sendiri" : "Belum ada TV beralamat sendiri"} href={tvAdminPath.screens} />
        {playing != null && <StatCard label="Tayangan aktif" value={playing} note={`${list.items!.length} baris di daftar tayangan`} href={tvAdminPath.playlist} />}
        <StatCard label="Mode papan" value={list.settings.mode === "light" ? "Terang" : "Gelap"} note={list.settings.qrShow ? "Kode QR tampil" : "Tanpa kode QR"} href={tvAdminPath.look} />
      </StatRow>

      <section className={akun.section} aria-labelledby="tv-pantauan">
        <SectionToolbar title={<span id="tv-pantauan">Layar TV</span>} count={`${list.screens.length} TV`} />
        {list.screens.length === 0 ? <p className={akun.empty}>Belum ada TV dengan alamat sendiri. TV yang membuka {absolute(origin, TV_HOME_PATH)} tetap tayang, tetapi tidak bisa dipantau dari sini. Tambahkan TV di Layar TV.</p>
          : <ul className={css.screens} aria-label="Layar TV">{list.screens.map(screen => {
            const status = state(screen, now);
            const address = screen.slug ? absolute(origin, tvPath(screen.slug)) : null;
            return <li key={screen.id} className={css.screen}>
              <div className={css.screenTop}><strong>{screen.name}</strong><Pill tone={status.tone}>{status.label}</Pill></div>
              <p className={css.meta}>
                {[screen.lastSeenAt ? `Terakhir terlihat ${agoLabel(screen.lastSeenAt, now)}` : null,
                  screen.lastItem ? `menayangkan ${screen.lastItem}` : null,
                  screen.width && screen.height ? `layar ${screen.width}×${screen.height} (${screen.height > screen.width ? "tegak" : "mendatar"})` : null,
                ].filter(Boolean).join(" · ") || "Buka alamatnya di browser TV untuk mulai menayangkan."}
              </p>
              {address && <code className={css.link}>{address}</code>}
              <div className={css.buttons}>
                <ConsoleButton icon={<RotateCw size={18} aria-hidden />} disabled={!!busy || list.items == null} onClick={() => void run(`muat-${screen.id}`, praWamTvApi.screenReload(screen.id), { method: "POST" })}>
                  {busy === `muat-${screen.id}` ? "Meminta…" : "Muat ulang TV"}
                </ConsoleButton>
                {address && <ConsoleButtonLink href={address} target="_blank" rel="noopener" icon={<ExternalLink size={18} aria-hidden />}>Buka</ConsoleButtonLink>}
              </div>
            </li>;
          })}</ul>}
        {list.items == null && <p className={akun.hint}>Muat ulang TV dari jauh dan &quot;sedang menayangkan&quot; menunggu migrasi 202611100007_pw_tv_playlist.sql.</p>}
        <p className={akun.hint}>Yang dicatat adalah tayangan terakhir yang dilaporkan TV, jadi bisa tertinggal beberapa detik.</p>
      </section>
    </>}
  </>;
}
