"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink, Link2, MoreHorizontal, Send } from "lucide-react";
import { Notice } from "@/components/ui";
import { Card, ConsoleButton, ConsoleButtonLink, PageHeader, Pill, type ConsoleTone, type Crumb } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { HOD_GROUP_TITLE, MOM_TOPIC, type BotStatus, type InstallCode, type TelegramGroup, type TelegramScope, type TelegramStatus } from "@/lib/pra-wam/telegram";
import { praWamTelegramApi } from "@/lib/routes";
import css from "./telegram-admin.module.css";

type Message = { tone: "success" | "error"; text: string } | null;
/** One row: the HOD group, or a department or one of its teams (with the group it has, if any). */
type Row = { key: string; scope: TelegramScope; department: string | null; unit: string | null; label: string; suggested: string; group: TelegramGroup | null; unknown?: boolean };

const time = (iso: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const dateTime = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const botLabels: Record<BotStatus, [string, ConsoleTone]> = { admin: ["Bot admin", "ok"], anggota: ["Bot anggota", "warn"], dikeluarkan: ["Bot dikeluarkan", "bad"] };
const same = (a: string | null, b: string | null) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/**
 * The HOD group first, then every department of Data karyawan, or each of its teams when it has
 * them (Sales & Marketing · Business Solutions); a group whose department or team is gone shows too.
 */
export function telegramRows(status: Pick<TelegramStatus, "groups" | "departments">): Row[] {
  const hod = status.groups.find(group => group.scope === "hod") ?? null;
  const rows: Row[] = [{ key: "hod", scope: "hod", department: null, unit: null, label: "Grup HOD", suggested: HOD_GROUP_TITLE, group: hod }];
  const at = (department: string | null, unit: string | null) => (group: TelegramGroup) => group.scope === "departemen" && same(group.department, department) && same(group.unit, unit);
  for (const item of status.departments) {
    rows.push({
      key: `d:${item.name}:${item.unit ?? ""}`, scope: "departemen", department: item.name, unit: item.unit,
      label: item.unit ? `${item.name} · ${item.unit}` : item.name, suggested: item.groupTitle, group: status.groups.find(at(item.name, item.unit)) ?? null,
    });
  }
  for (const group of status.groups) {
    if (group.scope === "departemen" && !status.departments.some(item => at(item.name, item.unit)(group))) {
      rows.push({
        key: `g:${group.chatId}`, scope: "departemen", department: group.department, unit: group.unit,
        label: group.unit ? `${group.department ?? ""} · ${group.unit}` : group.department ?? "", suggested: group.title, group, unknown: true,
      });
    }
  }
  return rows;
}

/**
 * Admin WAM → Telegram (12 Nov 2026): the MoM bot and its webhook, then one row per department
 * (and the HOD group) to tie a Telegram group to it with a one-time link, and to send a sample MoM.
 */
export function PraWamTelegram({ initial, crumbs = [] }: { initial: TelegramStatus; crumbs?: readonly Crumb[] }) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [codes, setCodes] = useState<Record<string, InstallCode>>({});
  const [copied, setCopied] = useState<string | null>(null);
  // An open Lainnya closes on a tap elsewhere or Esc.
  useEffect(() => {
    const close = (event: Event) => {
      for (const menu of document.querySelectorAll<HTMLDetailsElement>(`details.${css.more}[open]`)) {
        if (event instanceof KeyboardEvent ? event.key === "Escape" : !menu.contains(event.target as Node)) menu.open = false;
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, []);

  async function run(key: string, body: Record<string, unknown>) {
    setBusy(key); setMessage(null);
    try {
      const result = await adminRequest<TelegramStatus | InstallCode>(praWamTelegramApi, { method: "POST", body: JSON.stringify(body) });
      if (body.action === "install") setCodes(current => ({ ...current, [key]: result.data as InstallCode }));
      else if (result.data) setStatus(result.data as TelegramStatus);
      setMessage({ tone: "success", text: result.message });
    } catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); }
    finally { setBusy(null); }
  }

  async function refresh() {
    setBusy("refresh"); setMessage(null);
    try {
      const result = await adminRequest<TelegramStatus>(praWamTelegramApi);
      if (result.data) setStatus(result.data);
      setCodes({});
    } catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); }
    finally { setBusy(null); }
  }

  async function copy(key: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); }
    catch { setMessage({ tone: "error", text: "Tidak bisa menyalin otomatis. Pilih teksnya lalu salin manual." }); }
  }

  const webhook = status.webhook;
  const ready = status.configured && !!status.bot;
  const rows = telegramRows(status);
  const cos = status.groups.find(group => group.scope === "cos") ?? null;
  const installed = status.groups.filter(group => group.scope !== "cos").length;
  return <div className="stack">
    <PageHeader crumbs={crumbs} title="Telegram"
      subtitle="Bot WAM Werkudara mengirim MoM ke grup Telegram tiap departemen dan grup HOD. Pasang bot ke setiap grup dari sini."
      actions={<ConsoleButton onClick={refresh} disabled={busy !== null}>{busy === "refresh" ? "Memuat…" : "Muat ulang"}</ConsoleButton>} />
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    {!status.configured && <Notice tone="warning">Bot belum disiapkan di server. Isi TELEGRAM_BOT_TOKEN dan TELEGRAM_BOT_USERNAME di environment Vercel, lalu deploy ulang.</Notice>}
    {status.botError && <Notice tone="error">Telegram menolak token bot: {status.botError}. Periksa TELEGRAM_BOT_TOKEN di environment.</Notice>}
    {!status.migrated && <Notice tone="warning">Daftar grup menunggu migrasi 202611120002_pw_telegram.sql. Bot dan webhook sudah bisa dicek; grup bisa dipasang setelah migrasi dijalankan.</Notice>}

    <Card title="Bot">
      <div className={css.bot}>
        <div className={css.botInfo}>
          {status.bot
            ? <p><strong>{status.bot.name}</strong> · <a href={`https://t.me/${status.bot.username}`} target="_blank" rel="noopener">@{status.bot.username}<span className="sr-only"> (tab baru)</span></a></p>
            : <p className={css.muted}>{status.configured ? "Bot belum terbaca." : "Belum ada token bot."}</p>}
          <p className={css.muted}>
            Webhook: {!webhook ? "belum terbaca" : !webhook.set ? "belum dipasang" : webhook.ours ? "aktif" : "mengarah ke alamat lain"}
            {webhook && webhook.pending > 0 ? ` · ${webhook.pending} update menunggu` : ""}
          </p>
          {webhook?.lastError && <p className={css.warn}>Galat terakhir{webhook.lastErrorAt ? ` (${dateTime(webhook.lastErrorAt)})` : ""}: {webhook.lastError}</p>}
        </div>
        <ConsoleButton variant={webhook?.ours ? "secondary" : "primary"} disabled={!ready || busy !== null} onClick={() => run("webhook", { action: "webhook" })}>
          {busy === "webhook" ? "Memasang…" : webhook?.ours ? "Pasang ulang webhook" : "Pasang webhook"}
        </ConsoleButton>
      </div>
    </Card>

    <Card title={`Grup (${installed} terpasang)`}>
      <p className={css.muted}>
        Buat grup di Telegram dengan nama yang disarankan, tekan Pasang grup, lalu jadikan bot admin di grup itu. Kalau ingin topik {MOM_TOPIC},
        nyalakan Topics di grup dulu. Tautannya berlaku 30 menit dan sekali pakai.
      </p>
      <ul className={css.rows}>
        {rows.map(row => {
          const code = codes[row.key];
          const group = row.group;
          const [botText, botTone] = group ? botLabels[group.botStatus] : ["", "neutral" as ConsoleTone];
          const gone = group?.botStatus === "dikeluarkan";
          const install = !row.unknown && <ConsoleButton variant={group && !gone ? "secondary" : "primary"} icon={<Link2 size={16} aria-hidden="true" />} disabled={!ready || !status.migrated || busy !== null}
            onClick={() => run(row.key, { action: "install", scope: row.scope, department: row.department, unit: row.unit })}>
            {busy === row.key ? "Membuat…" : group ? "Pasang ulang" : "Pasang grup"}
          </ConsoleButton>;
          return <li key={row.key} className={css.row}>
            <div className={css.rowMain}>
              <div className={css.rowHead}>
                <strong>{row.label}</strong>
                {group && <Pill tone={botTone}>{botText}</Pill>}
              </div>
              {group
                ? <p className={css.meta}>
                    {group.inviteLink
                      ? <a className={css.groupLink} href={group.inviteLink} target="_blank" rel="noopener">{group.title || "Tanpa nama"} <ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (buka grup, tab baru)</span></a>
                      : <span>{group.title || "Tanpa nama"}</span>}
                    <Pill tone={group.momTopicId ? "ok" : "neutral"}>{group.momTopicId ? `Topik ${MOM_TOPIC}` : group.isForum ? "Topik belum dibuat" : "Tanpa topik"}</Pill>
                    {row.unknown && <Pill tone="warn">Tidak ada di Data karyawan</Pill>}
                  </p>
                : <p className={css.muted}>Belum ada grup · nama disarankan: {row.suggested}</p>}
              {group?.botStatus === "anggota" && <p className={css.hint}>Jadikan bot admin di grup ini (Edit → Administrators) agar alamat grupnya bisa dibuka dari WAM.</p>}
              {/* One name for every group (13 Nov 2026): WG {singkatan} · {nama lengkap}. */}
              {group && !row.unknown && group.title !== row.suggested && <p className={css.hint}>Nama di Telegram belum seragam. Seharusnya <strong>{row.suggested}</strong> (Lainnya → Samakan nama).</p>}
            </div>
            <div className={css.actions}>
              {group && !gone && <ConsoleButton variant="primary" icon={<Send size={16} aria-hidden="true" />} disabled={!ready || busy !== null}
                onClick={() => run(`sample:${group.chatId}`, { action: "sample", chatId: group.chatId })}>
                {busy === `sample:${group.chatId}` ? "Mengirim…" : "Kirim contoh MoM"}
              </ConsoleButton>}
              {(!group || gone) && install}
              {group?.inviteLink && <ConsoleButton icon={<Copy size={16} aria-hidden="true" />} onClick={() => copy(`invite:${group.chatId}`, group.inviteLink!)}>
                {copied === `invite:${group.chatId}` ? "Alamat tersalin" : "Salin alamat"}
              </ConsoleButton>}
              {group && <details className={css.more}>
                <summary className={css.moreButton}><MoreHorizontal size={16} aria-hidden="true" /> Lainnya</summary>
                <div className={css.moreList} onClick={event => { if ((event.target as HTMLElement).closest("button")) (event.currentTarget.parentElement as HTMLDetailsElement).open = false; }}>
                  {/* Not only for a group known to have topics: one that turned them on later is checked by the server. */}
                  {!row.unknown && !gone && group.title !== row.suggested && <ConsoleButton disabled={!ready || busy !== null} onClick={() => run(`rename:${group.chatId}`, { action: "rename", chatId: group.chatId })}>
                    {busy === `rename:${group.chatId}` ? "Mengganti…" : "Samakan nama"}
                  </ConsoleButton>}
                  {!group.momTopicId && <ConsoleButton disabled={!ready || busy !== null} onClick={() => run(`topic:${group.chatId}`, { action: "topic", chatId: group.chatId })}>
                    {busy === `topic:${group.chatId}` ? "Membuat…" : "Buat topik"}
                  </ConsoleButton>}
                  {!gone && install}
                  <ConsoleButton disabled={busy !== null} onClick={() => {
                    if (window.confirm(`Lepas ${group.title} dari WAM? MoM tidak dikirim ke grup itu lagi. Bot tetap di grup sampai dikeluarkan.`)) void run(`remove:${group.chatId}`, { action: "remove", chatId: group.chatId });
                  }}>Lepas</ConsoleButton>
                </div>
              </details>}
            </div>
            {code && <div className={css.code} role="group" aria-label={`Pasang grup ${row.label}`}>
              <p><strong>Cara 1:</strong> buka tautan ini di perangkat yang ada Telegram-nya, pilih grup <strong>{row.suggested}</strong>, lalu tambahkan bot sebagai admin.</p>
              <div className={css.codeButtons}>
                <ConsoleButtonLink variant="primary" href={code.link} target="_blank" rel="noopener" icon={<ExternalLink size={16} aria-hidden="true" />}>Buka di Telegram<span className="sr-only"> (tab baru)</span></ConsoleButtonLink>
                <ConsoleButton icon={<Copy size={16} aria-hidden="true" />} onClick={() => copy(`link:${row.key}`, code.link)}>{copied === `link:${row.key}` ? "Tautan tersalin" : "Salin tautan"}</ConsoleButton>
              </div>
              <p><strong>Cara 2</strong> (bot sudah ada di grup): kirim perintah ini di grup tersebut.</p>
              <code className={css.command}>{code.command}</code>
              <div className={css.codeButtons}>
                <ConsoleButton icon={<Copy size={16} aria-hidden="true" />} onClick={() => copy(`cmd:${row.key}`, code.command)}>{copied === `cmd:${row.key}` ? "Perintah tersalin" : "Salin perintah"}</ConsoleButton>
              </div>
              <p className={css.muted}>Berlaku sampai {time(code.expiresAt)} WIB. Setelah bot membalas “Grup ini terpasang”, tekan Muat ulang.</p>
            </div>}
          </li>;
        })}
      </ul>
    </Card>

    {/* 13 Nov 2026: a meeting with a BOD member also goes to the CoS's own chat, who forwards it to the BOD. */}
    <Card title="MoM untuk BOD (lewat CoS)">
      <p className={css.muted}>MoM meeting yang diikuti BOD juga dikirim ke chat Telegram pribadi CoS. CoS yang meneruskannya ke BOD.</p>
      <div className={`${css.row} ${css.single}`}>
        <div className={css.rowMain}>
          <div className={css.rowHead}>
            <strong>{cos ? cos.title : "Chat CoS"}</strong>
            {cos && <Pill tone={cos.botStatus === "dikeluarkan" ? "bad" : "ok"}>{cos.botStatus === "dikeluarkan" ? "Bot diblokir" : "Tersambung"}</Pill>}
          </div>
          <p className={css.muted}>{!cos ? "Belum tersambung. Buat tautan, lalu kirim ke CoS." : cos.botStatus === "dikeluarkan" ? "CoS memblokir bot. Minta CoS membuka bot lagi dan menekan Start, atau sambungkan ulang." : `Tersambung sejak ${dateTime(cos.installedAt)}.`}</p>
        </div>
        <div className={css.actions}>
          {cos && cos.botStatus !== "dikeluarkan" && <ConsoleButton variant="primary" icon={<Send size={16} aria-hidden="true" />} disabled={!ready || busy !== null}
            onClick={() => run(`sample:${cos.chatId}`, { action: "sample", chatId: cos.chatId })}>
            {busy === `sample:${cos.chatId}` ? "Mengirim…" : "Kirim contoh MoM"}
          </ConsoleButton>}
          <ConsoleButton variant={cos && cos.botStatus !== "dikeluarkan" ? "secondary" : "primary"} icon={<Link2 size={16} aria-hidden="true" />} disabled={!ready || !status.migrated || busy !== null}
            onClick={() => run("cos", { action: "install", scope: "cos" })}>
            {busy === "cos" ? "Membuat…" : cos ? "Ganti CoS" : "Sambungkan CoS"}
          </ConsoleButton>
          {cos && <ConsoleButton disabled={busy !== null} onClick={() => {
            if (window.confirm(`Lepas ${cos.title} dari WAM? MoM meeting BOD tidak dikirim ke CoS lagi.`)) void run(`remove:${cos.chatId}`, { action: "remove", chatId: cos.chatId });
          }}>Lepas</ConsoleButton>}
        </div>
        {codes.cos && <div className={css.code} role="group" aria-label="Sambungkan chat CoS">
          <p>Kirim tautan ini ke CoS. CoS membukanya di Telegram, lalu menekan <strong>Start</strong>. Bot membalas “Chat ini terpasang”.</p>
          <div className={css.codeButtons}>
            <ConsoleButtonLink variant="primary" href={codes.cos.link} target="_blank" rel="noopener" icon={<ExternalLink size={16} aria-hidden="true" />}>Buka di Telegram<span className="sr-only"> (tab baru)</span></ConsoleButtonLink>
            <ConsoleButton icon={<Copy size={16} aria-hidden="true" />} onClick={() => copy("link:cos", codes.cos.link)}>{copied === "link:cos" ? "Tautan tersalin" : "Salin tautan"}</ConsoleButton>
          </div>
          <p className={css.muted}>Berlaku sampai {time(codes.cos.expiresAt)} WIB dan sekali pakai. Setelah tersambung, tekan Muat ulang.</p>
        </div>}
      </div>
    </Card>
  </div>;
}
