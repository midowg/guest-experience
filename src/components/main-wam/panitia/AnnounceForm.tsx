"use client";

import { useMemo, useState } from "react";
import { Building2, Clock, Megaphone, Send, ShieldCheck, Trash2, Users, UsersRound } from "lucide-react";
import { ScreenContent, ScreenSection } from "@/components/main-wam/shell";
import { ActionBar, Banner, Button, ConfirmDialog, EmptyState, IconBox, List, ListRow, Pill, SectionHeader, Sheet, SwitchRow, Text, TextField, useToast, type IconProp } from "@/components/main-wam/ui";
import { clockMinutes, count, dayClock, formatMinutes, parseClock } from "@/lib/main-wam/panitia/format";
import { ANNOUNCE_BODY_MAX, ANNOUNCE_TITLE_MAX, announceSchema, type AnnounceInput } from "@/lib/main-wam/panitia/schemas";
import { wibDate, wibInstant } from "@/lib/main-wam/rundown";
import { mainWamPath } from "@/lib/routes";
import type { AnnounceData, SentAnnouncement } from "@/lib/server/main-wam/panitia/announce";
import { errorText, PanitiaError, usePanitiaApi } from "./api";
import { CheckboxRow } from "./parts";
import css from "./panitia.module.css";

type AudienceType = AnnounceInput["audience"]["type"];
const DAY = 86_400_000;

/** The default "Sampai": four hours on, up to the next half hour. */
export function defaultPinTime(now: Date): string {
  const minutes = clockMinutes(now.toISOString()) + 240;
  return formatMinutes(Math.ceil(minutes / 30) * 30 % (24 * 60));
}
/** "15.00" typed today → the next 15.00 after now (tomorrow when it has passed today). */
export function pinInstant(typed: string, now: Date): { iso: string; tomorrow: boolean } | null {
  const minutes = parseClock(typed);
  if (minutes === null) return null;
  const today = new Date(wibInstant(wibDate(now.toISOString()), formatMinutes(minutes).replace(".", ":")));
  const tomorrow = today.getTime() <= now.getTime();
  return { iso: new Date(today.getTime() + (tomorrow ? DAY : 0)).toISOString(), tomorrow };
}

/**
 * K06 Kirim pengumuman: Judul (60), Isi (300), Penerima (Semua · N orang, Kelompok tertentu,
 * Departemen tertentu, Panitia saja), "Sematkan di Beranda" until a time, and Kirim, which asks
 * "Kirim ke N orang?" first (it cannot be taken back). Under it, what panitia sent lately and by
 * whom ("dikirim Dimas · 10.28"): a sent one can be taken off Beranda or removed.
 */
export function AnnounceForm({ migrated, counts, sent: initialSent, now: nowIso }: AnnounceData & { now: string }) {
  const api = usePanitiaApi();
  const toast = useToast();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<AudienceType>("semua");
  const [groups, setGroups] = useState<Set<string>>(new Set());
  const [departments, setDepartments] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<"kelompok" | "departemen" | null>(null);
  const [pin, setPin] = useState(false);
  const [until, setUntil] = useState(() => defaultPinTime(now));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(initialSent);
  const [opened, setOpened] = useState<SentAnnouncement | null>(null);
  const [removing, setRemoving] = useState(false);
  const [working, setWorking] = useState(false);

  const reach = type === "semua" ? counts.semua : type === "panitia" ? counts.panitia
    : type === "kelompok" ? counts.groups.filter(group => groups.has(group.id)).reduce((sum, group) => sum + group.count, 0)
      : counts.departments.filter(item => departments.has(item.name)).reduce((sum, item) => sum + item.count, 0);
  const pinAt = pin ? pinInstant(until, now) : null;

  function input(): AnnounceInput | null {
    const audience = type === "kelompok" ? { type, groupIds: [...groups] } : type === "departemen" ? { type, departments: [...departments] } : { type };
    const found: Record<string, string> = {};
    if (pin && !pinAt) found.until = "Tulis jam seperti 15.00.";
    const parsed = announceSchema.safeParse({ title, body, audience, pinnedUntil: pinAt?.iso ?? null });
    if (!parsed.success) for (const issue of parsed.error.issues) {
      const key = issue.path[0] === "audience" ? "audience" : String(issue.path[0]);
      found[key] ??= issue.message;
    }
    if (!found.audience && type !== "semua" && reach === 0) found.audience = "Belum ada penerima untuk pilihan ini.";
    setErrors(found);
    if (Object.keys(found).length) {
      if (found.title) document.getElementById("mw-judul")?.focus();
      return null;
    }
    return parsed.success ? parsed.data : null;
  }

  async function send() {
    const value = input();
    if (!value || sending) return;
    setSending(true);
    try {
      const answer = await api.announce(value);
      setConfirming(false);
      toast.show({ text: `Terkirim ke ${count(answer.count)} orang`, tone: "success" });
      api.navigate(mainWamPath.committee);
    } catch (error) {
      setConfirming(false);
      if (error instanceof PanitiaError && error.fieldErrors?.pinnedUntil) setErrors({ until: error.fieldErrors.pinnedUntil[0] });
      else toast.show({ text: errorText(error), tone: "error" });
    } finally { setSending(false); }
  }

  async function act(kind: "unpin" | "remove") {
    if (!opened || working) return;
    setWorking(true);
    try {
      if (kind === "unpin") {
        await api.unpin(opened.id);
        setSent(current => current.map(item => item.id === opened.id ? { ...item, pinnedUntil: null } : item));
        toast.show({ text: "Dilepas dari Beranda", tone: "success" });
      } else {
        await api.removeAnnouncement(opened.id);
        setSent(current => current.filter(item => item.id !== opened.id));
        toast.show({ text: "Pengumuman dihapus", tone: "success" });
      }
      setOpened(null);
      setRemoving(false);
      api.refresh();
    } catch (error) {
      toast.show({ text: errorText(error), tone: "error" });
    } finally { setWorking(false); }
  }

  const options: { value: AudienceType; icon: IconProp; title: string; sub?: string }[] = [
    { value: "semua", icon: Users, title: `Semua · ${count(counts.semua)} orang` },
    { value: "kelompok", icon: UsersRound, title: "Kelompok tertentu", sub: type === "kelompok" && groups.size ? `${counts.groups.filter(group => groups.has(group.id)).map(group => group.label).join(", ")} · ${count(reach)} orang` : undefined },
    { value: "departemen", icon: Building2, title: "Departemen tertentu", sub: type === "departemen" && departments.size ? `${[...departments].join(", ")} · ${count(reach)} orang` : undefined },
    { value: "panitia", icon: ShieldCheck, title: "Panitia saja", sub: type === "panitia" ? `${count(counts.panitia)} orang` : undefined },
  ];
  const choose = (value: AudienceType) => {
    setType(value);
    setErrors(current => ({ ...current, audience: "" }));
    if (value === "kelompok" || value === "departemen") setPicker(value);
  };
  const pinned = (item: SentAnnouncement) => !!item.pinnedUntil && Date.parse(item.pinnedUntil) > now.getTime();

  return <>
    <ScreenContent>
      {!migrated && <Banner tone="info" title="Menunggu pembaruan sistem">Pengumuman bisa dikirim setelah pembaruan sistem dijalankan.</Banner>}
      <TextField id="mw-judul" label="Judul" value={title} onChange={event => { setTitle(event.target.value); setErrors(current => ({ ...current, title: "" })); }}
        showCount countMax={ANNOUNCE_TITLE_MAX} maxLength={ANNOUNCE_TITLE_MAX} error={errors.title || undefined} autoComplete="off" enterKeyHint="next" />
      <TextField multiline rows={4} label="Isi" value={body} onChange={event => setBody(event.target.value)} showCount countMax={ANNOUNCE_BODY_MAX} maxLength={ANNOUNCE_BODY_MAX} error={errors.body || undefined} />
      <fieldset className={css.radios} aria-describedby={errors.audience ? "mw-penerima-galat" : undefined}>
        <legend>Penerima</legend>
        {options.map(option => <label key={option.value} className={css.radio}>
          <input className={css.radioInput} type="radio" name="penerima" value={option.value} checked={type === option.value} onChange={() => choose(option.value)}
            onClick={() => { if (type === option.value && (option.value === "kelompok" || option.value === "departemen")) setPicker(option.value); }} />
          <IconBox icon={option.icon} />
          <span className={css.radioText}><span className={css.radioTitle}>{option.title}</span>{option.sub && <span className={css.radioSub}>{option.sub}</span>}</span>
          <span className={css.radioMark} aria-hidden />
        </label>)}
        {errors.audience && <p id="mw-penerima-galat" className={css.errorText} role="alert">{errors.audience}</p>}
      </fieldset>
      <div className={css.pin}>
        <SwitchRow title="Sematkan di Beranda" checked={pin} onChange={setPin} />
        {pin && <TextField className={css.half} label="Sampai" icon={<Clock />} inputMode="decimal" autoComplete="off" value={until}
          onChange={event => { setUntil(event.target.value); setErrors(current => ({ ...current, until: "" })); }}
          onBlur={() => { const minutes = parseClock(until); if (minutes !== null) setUntil(formatMinutes(minutes)); }}
          error={errors.until || undefined} help={!errors.until && pinAt?.tomorrow ? "Besok" : undefined} />}
      </div>

      {sent.length > 0 && <ScreenSection label="Terkirim">
        <SectionHeader title="Terkirim" />
        <List>
          {sent.map(item => <ListRow key={item.id} icon={<Megaphone />} title={item.title} onClick={() => setOpened(item)}
            sub={[item.by ? `dikirim ${item.by}` : "dikirim", dayClock(item.at, now)].join(" · ")} trailing={pinned(item) ? <Pill tone="primary">Tersemat</Pill> : undefined} />)}
        </List>
      </ScreenSection>}
    </ScreenContent>

    <ActionBar><Button block icon={<Send />} onClick={() => { if (input()) setConfirming(true); }} disabled={!migrated}>Kirim</Button></ActionBar>

    <ConfirmDialog open={confirming} onCancel={() => setConfirming(false)} onConfirm={send} busy={sending} busyLabel="Mengirim…"
      title={`Kirim ke ${count(reach)} orang?`} body="Tidak bisa ditarik setelah terkirim." confirmLabel="Kirim" />

    <Sheet open={picker !== null} onClose={() => setPicker(null)} title={picker === "kelompok" ? "Pilih kelompok" : "Pilih departemen"} flush
      footer={<Button block onClick={() => setPicker(null)}>Selesai</Button>}>
      {picker === "kelompok" && (counts.groups.length
        ? <List plain inset={16} label="Kelompok">
          {counts.groups.map(group => <CheckboxRow key={group.id} title={group.label} sub={`${count(group.count)} orang`} checked={groups.has(group.id)}
            onToggle={() => setGroups(current => { const next = new Set(current); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; })} />)}
        </List>
        : <EmptyState icon={<UsersRound />} title="Kelompok belum dibuat." size="s" headingLevel={3}>Kelompok diatur di Admin WAM.</EmptyState>)}
      {picker === "departemen" && <List plain inset={16} label="Departemen">
        {counts.departments.map(item => <CheckboxRow key={item.name} title={item.name} sub={`${count(item.count)} orang`} checked={departments.has(item.name)}
          onToggle={() => setDepartments(current => { const next = new Set(current); if (next.has(item.name)) next.delete(item.name); else next.add(item.name); return next; })} />)}
      </List>}
    </Sheet>

    <Sheet open={opened !== null && !removing} onClose={() => setOpened(null)} title={opened?.title ?? "Pengumuman"}
      subtitle={opened ? [opened.by ? `dikirim ${opened.by}` : "dikirim", dayClock(opened.at, now), opened.audience].filter(Boolean).join(" · ") : undefined}
      footer={opened && <>
        {pinned(opened) && <Button block variant="secondary" loading={working} loadingLabel="Menyimpan…" onClick={() => act("unpin")}>Lepas dari Beranda</Button>}
        <Button block variant="danger-outline" icon={<Trash2 />} disabled={working} onClick={() => setRemoving(true)}>Hapus</Button>
      </>}>
      {opened?.body ? <Text variant="body-long">{opened.body}</Text> : <Text variant="body" color="2">Tanpa isi.</Text>}
    </Sheet>
    <ConfirmDialog open={removing} onCancel={() => { setRemoving(false); setOpened(null); }} onConfirm={() => act("remove")} busy={working} busyLabel="Menghapus…" tone="danger"
      title="Hapus pengumuman ini?" body="Hilang dari lonceng semua orang. Notifikasi yang sudah muncul di HP tetap ada." confirmLabel="Hapus pengumuman" />
  </>;
}
