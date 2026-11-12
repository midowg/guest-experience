"use client";

import { useState } from "react";
import { Copy, ExternalLink, Link2, Send } from "lucide-react";
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
  const installed = status.groups.length;
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
        Buat grup di Telegram dengan nama yang disarankan. Kalau ingin topik {MOM_TOPIC}, ubah grup ke supergroup dan nyalakan Topics dulu,
        baru tekan Pasang grup. Tautannya berlaku 30 menit dan sekali pakai.
      </p>
      <ul className={css.rows}>
        {rows.map(row => {
          const code = codes[row.key];
          const group = row.group;
          const [botText, botTone] = group ? botLabels[group.botStatus] : ["", "neutral" as ConsoleTone];
          return <li key={row.key} className={css.row}>
            <div className={css.rowMain}>
              <strong>{row.label}</strong>
              {group
                ? <p className={css.meta}>
                    <span>{group.title || "Tanpa nama"}</span>
                    <Pill tone={botTone}>{botText}</Pill>
                    <Pill tone={group.momTopicId ? "ok" : "neutral"}>{group.momTopicId ? `Topik ${MOM_TOPIC}` : group.isForum ? "Topik belum dibuat" : "Tanpa topik"}</Pill>
                    {row.unknown && <Pill tone="warn">Tidak ada di Data karyawan</Pill>}
                    {group.inviteLink && <a href={group.inviteLink} target="_blank" rel="noopener">Buka grup<span className="sr-only"> {group.title} (tab baru)</span></a>}
                  </p>
                : <p className={css.meta}><span className={css.muted}>Belum ada grup · nama disarankan: {row.suggested}</span></p>}
            </div>
            <div className={css.buttons}>
              {group?.inviteLink && <ConsoleButton icon={<Copy size={16} aria-hidden="true" />} onClick={() => copy(`invite:${group.chatId}`, group.inviteLink!)}>
                {copied === `invite:${group.chatId}` ? "Alamat tersalin" : "Salin alamat grup"}
              </ConsoleButton>}
              {group && <ConsoleButton variant="primary" icon={<Send size={16} aria-hidden="true" />} disabled={!ready || busy !== null}
                onClick={() => run(`sample:${group.chatId}`, { action: "sample", chatId: group.chatId })}>
                {busy === `sample:${group.chatId}` ? "Mengirim…" : "Kirim contoh MoM"}
              </ConsoleButton>}
              {/* Not only for a group known to have topics: one that turned them on later is checked by the server. */}
              {group && !group.momTopicId && <ConsoleButton disabled={!ready || busy !== null} onClick={() => run(`topic:${group.chatId}`, { action: "topic", chatId: group.chatId })}>
                {busy === `topic:${group.chatId}` ? "Membuat…" : "Buat topik"}
              </ConsoleButton>}
              {!row.unknown && <ConsoleButton icon={<Link2 size={16} aria-hidden="true" />} disabled={!ready || !status.migrated || busy !== null}
                onClick={() => run(row.key, { action: "install", scope: row.scope, department: row.department, unit: row.unit })}>
                {busy === row.key ? "Membuat…" : group ? "Pasang ulang" : "Pasang grup"}
              </ConsoleButton>}
              {group && <ConsoleButton disabled={busy !== null} onClick={() => {
                if (window.confirm(`Lepas ${group.title} dari WAM? MoM tidak dikirim ke grup itu lagi. Bot tetap di grup sampai dikeluarkan.`)) void run(`remove:${group.chatId}`, { action: "remove", chatId: group.chatId });
              }}>Lepas</ConsoleButton>}
            </div>
            {code && <div className={css.code} role="group" aria-label={`Pasang grup ${row.label}`}>
              <p><strong>Cara 1:</strong> buka tautan ini di perangkat yang ada Telegram-nya, pilih grup <strong>{row.suggested}</strong>, lalu tambahkan bot sebagai admin.</p>
              <div className={css.buttons}>
                <ConsoleButtonLink variant="primary" href={code.link} target="_blank" rel="noopener" icon={<ExternalLink size={16} aria-hidden="true" />}>Buka di Telegram<span className="sr-only"> (tab baru)</span></ConsoleButtonLink>
                <ConsoleButton icon={<Copy size={16} aria-hidden="true" />} onClick={() => copy(`link:${row.key}`, code.link)}>{copied === `link:${row.key}` ? "Tautan tersalin" : "Salin tautan"}</ConsoleButton>
              </div>
              <p><strong>Cara 2</strong> (bot sudah ada di grup): kirim perintah ini di grup tersebut.</p>
              <code className={css.command}>{code.command}</code>
              <div className={css.buttons}>
                <ConsoleButton icon={<Copy size={16} aria-hidden="true" />} onClick={() => copy(`cmd:${row.key}`, code.command)}>{copied === `cmd:${row.key}` ? "Perintah tersalin" : "Salin perintah"}</ConsoleButton>
              </div>
              <p className={css.muted}>Berlaku sampai {time(code.expiresAt)} WIB. Setelah bot membalas “Grup ini terpasang”, tekan Muat ulang.</p>
            </div>}
          </li>;
        })}
      </ul>
    </Card>
  </div>;
}
