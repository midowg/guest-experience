"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { ClipboardPaste, MapPinned, Pencil, Plus, Trash2 } from "lucide-react";
import { ConsoleButton, PageHeader, PageTabs, Pill, type Crumb } from "@/components/console";
import { adminRequest } from "@/components/admin/shared/api";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import {
  activityColumnLabels, activityInputSchema, parseActivityPaste, sortOf, type ActivityInput, type ActivityPaste, type ActivityPasteRow,
} from "@/lib/main-wam/admin/groups";
import { activityKindLabels } from "@/lib/main-wam/admin/labels";
import type { AdminPerson } from "@/lib/main-wam/admin/people";
import { MAIN_WAM_MIGRATION } from "@/lib/main-wam/settings";
import { timeRange, wibDate } from "@/lib/main-wam/rundown";
import { ACTIVITY_GROUP_KINDS, type ActivityGroupKind, type MwActivityGroup, type MwSession } from "@/lib/main-wam/types";
import { mainWamAdminApi } from "@/lib/routes";
import { mainWamContentTabs } from "../tabs";
import { Choice, dayOptionLabel, described, Field, MessageLine, NumberInput, useRun, Waiting, type Message, type Problems } from "./fields";
import { GroupSubtabs } from "./GroupsEditor";
import { PasteSheet } from "./PasteSheet";
import { PeoplePicker } from "./PeoplePicker";
import { Sheet } from "./Sheet";
import css from "./isi.module.css";

type SheetState = { type: "edit"; group: MwActivityGroup | null } | { type: "import" } | null;
type Answer = { groups: MwActivityGroup[]; id?: string };
const SHOWN_NAMES = 8;
const word: Record<ActivityGroupKind, string> = { pos: "pos", angkot: "angkot", meja: "meja", lain: "kelompok" };

/**
 * Admin WAM → Main WAM → Kelompok → Kelompok kegiatan (agen E): per session (team building,
 * trekking, gala), who is at which post, minibus or table; one per person per session. Typed in a
 * sheet or pasted from a sheet; participants see theirs on Saya → Kelompok & kamar.
 */
export function ActivityGroupsEditor({ initial, migrated, sessions, people, dates, firstSession, crumbs, title }: {
  initial: MwActivityGroup[]; migrated: boolean; sessions: readonly MwSession[]; people: readonly AdminPerson[]; dates: readonly string[];
  firstSession?: string | null; crumbs: readonly Crumb[]; title: string;
}) {
  const [groups, setGroups] = useState(initial);
  const choices = sessions.filter(session => session.status !== "batal" && session.kind !== "makan");
  const [sessionId, setSessionId] = useState<string>(() => firstSession && choices.some(session => session.id === firstSession) ? firstSession
    : (choices.find(session => initial.some(group => group.sessionId === session.id)) ?? choices[0])?.id ?? "");
  const [sheet, setSheet] = useState<SheetState>(null);
  const [message, setMessage] = useState<Message>(null);
  const { busy, run } = useRun(setMessage);
  const [confirm, confirmDialog] = useConfirm();
  const names = useMemo(() => new Map(people.map(person => [person.id, person.fullName])), [people]);
  const session = choices.find(item => item.id === sessionId) ?? null;
  const here = useMemo(() => groups.filter(group => group.sessionId === sessionId).sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, "id")), [groups, sessionId]);
  const placedHere = new Set(here.flatMap(group => group.members));
  const kind: ActivityGroupKind = here[0]?.kind ?? "pos";
  const apply = (answer: Answer) => setGroups(answer.groups);
  const send = async (url: string, method: string, body?: unknown) => adminRequest<Answer>(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const parse = useCallback((text: string) => parseActivityPaste(text, { people, existing: here, kind }), [people, here, kind]);
  const countOf = (id: string) => groups.filter(group => group.sessionId === id).length;

  async function remove(group: MwActivityGroup) {
    if (!(await confirm({ title: `Hapus ${group.label}?`, body: `${group.members.length} orang di ${group.label} jadi belum punya ${word[group.kind]} di sesi ini.`, confirmLabel: "Hapus", danger: true }))) return;
    await run(`hapus-${group.id}`, async () => { const result = await send(mainWamAdminApi.activityGroup(group.id), "DELETE"); apply(result.data!); return result.message; });
  }

  return <div className={css.page}>
    <PageHeader crumbs={crumbs} title={title} subtitle="Pos team building, angkot trekking, meja gala: siapa di mana, per sesi."
      actions={<>
        <ConsoleButton icon={<ClipboardPaste size={18} aria-hidden />} disabled={!migrated || !session} onClick={() => setSheet({ type: "import" })}>Impor</ConsoleButton>
        <ConsoleButton variant="primary" icon={<Plus size={18} aria-hidden />} disabled={!migrated || !session} onClick={() => setSheet({ type: "edit", group: null })}>Tambah</ConsoleButton>
      </>} />
    <PageTabs tabs={mainWamContentTabs} current="kelompok" label="Isi acara" />
    <GroupSubtabs current="kegiatan" />
    {!migrated && <Waiting what="Kelompok kegiatan" migration={MAIN_WAM_MIGRATION} />}
    <MessageLine message={message} />

    {choices.length ? <>
      <div className={css.toolbar}>
        <div className={css.field}>
          <label htmlFor="mw-kegiatan-sesi">Sesi</label>
          <select id="mw-kegiatan-sesi" className="select" value={sessionId} onChange={event => setSessionId(event.target.value)}>
            {choices.map(item => <option key={item.id} value={item.id}>{`${dayOptionLabel(dates, wibDate(item.startsAt))} · ${timeRange(item)} ${item.title}${countOf(item.id) ? ` (${countOf(item.id)})` : ""}`}</option>)}
          </select>
        </div>
        <ul className={css.summary} aria-label="Ringkasan sesi ini">
          <li><strong>{here.length}</strong> {word[kind]}</li>
          <li><strong>{placedHere.size}</strong> dari {people.length} orang</li>
        </ul>
      </div>
      {here.length ? <ul className={css.grid} aria-label={`Kelompok kegiatan ${session?.title ?? ""}`}>
        {here.map(group => {
          const members = group.members.map(id => names.get(id) ?? "Tanpa nama").sort((a, b) => a.localeCompare(b, "id"));
          return <li key={group.id} className={css.item}>
            <div className={css.itemHead}>
              <div>
                <h2 className={css.itemTitle}>{group.label}</h2>
                <p className={css.itemSub}>{group.members.length} orang{group.note ? ` · ${group.note}` : ""}</p>
              </div>
              <div className={css.actions}>
                <button type="button" className={css.iconButton} onClick={() => setSheet({ type: "edit", group })} disabled={busy !== null} aria-label={`Ubah ${group.label}`} title="Ubah"><Pencil size={18} aria-hidden /></button>
                <button type="button" className={`${css.iconButton} ${css.iconDanger}`} onClick={() => void remove(group)} disabled={busy !== null} aria-label={`Hapus ${group.label}`} title="Hapus"><Trash2 size={18} aria-hidden /></button>
              </div>
            </div>
            <div className={css.chips}><Pill tone="neutral">{activityKindLabels[group.kind]}</Pill></div>
            {members.length ? <p className={css.names}>{members.slice(0, SHOWN_NAMES).join(", ")}{members.length > SHOWN_NAMES ? `, dan ${members.length - SHOWN_NAMES} lainnya` : ""}</p> : <p className={css.small}>Belum ada orang.</p>}
          </li>;
        })}
      </ul> : <div className={css.empty}>
        <MapPinned size={24} aria-hidden />
        <h3>Belum ada kelompok kegiatan di sesi ini</h3>
        <p>Tempel pembagian dari Excel (kelompok kegiatan, nama karyawan), atau tambah satu per satu.</p>
        {migrated && <div className={css.emptyActions}>
          <ConsoleButton variant="primary" icon={<ClipboardPaste size={18} aria-hidden />} onClick={() => setSheet({ type: "import" })}>Impor</ConsoleButton>
          <ConsoleButton icon={<Plus size={18} aria-hidden />} onClick={() => setSheet({ type: "edit", group: null })}>Tambah</ConsoleButton>
        </div>}
      </div>}
    </> : <div className={css.empty}>
      <h3>Belum ada sesi</h3>
      <p>Kelompok kegiatan dibuat per sesi. Isi rundown dulu.</p>
    </div>}

    {sheet?.type === "edit" && session && <ActivitySheet group={sheet.group} session={session} here={here} people={people} busy={busy === "simpan"} kind={kind}
      onClose={() => setSheet(null)}
      onSave={(input, employeeIds) => void run("simpan", async () => {
        const result = sheet.group ? await send(mainWamAdminApi.activityGroup(sheet.group.id), "PUT", { group: input, employeeIds })
          : await send(mainWamAdminApi.activityGroups, "POST", { action: "tambah", group: input, employeeIds });
        apply(result.data!);
        setSheet(null);
        return result.message;
      })} />}
    {sheet?.type === "import" && session && <PasteSheet<ActivityPasteRow, ActivityPaste> title={`Impor · ${session.title}`}
      subtitle="Satu orang per baris. Kelompok kegiatan yang ada di tempelan berisi persis orang-orang di tempelan."
      columns={activityColumnLabels} parse={parse} busy={busy === "impor"}
      example={"Kelompok kegiatan\tNama karyawan\nPos 2\tRani Contoh\nPos 2\tSari Contoh\nPos 3\tDimas Contoh"}
      heads={["Kelompok kegiatan", "Nama karyawan"]}
      cells={input => [input.label, names.get(input.personId) ?? ""]}
      saveLabel={count => `Simpan ${count} orang`}
      onClose={() => setSheet(null)}
      onSave={parsed => void run("impor", async () => {
        const result = await send(mainWamAdminApi.activityGroups, "POST", { action: "impor", sessionId, groups: parsed.groups });
        apply(result.data!);
        setSheet(null);
        return result.message;
      })} />}
    {confirmDialog}
  </div>;
}

function ActivitySheet({ group, session, here, people, kind: firstKind, busy, onClose, onSave }: {
  group: MwActivityGroup | null; session: MwSession; here: readonly MwActivityGroup[]; people: readonly AdminPerson[]; kind: ActivityGroupKind; busy: boolean;
  onClose: () => void; onSave: (input: ActivityInput, employeeIds: string[]) => void;
}) {
  const id = useId();
  const [kind, setKind] = useState<ActivityGroupKind>(group?.kind ?? firstKind);
  const [label, setLabel] = useState(group?.label ?? "");
  const [note, setNote] = useState(group?.note ?? "");
  const [sort, setSort] = useState<number | null>(group?.sort ?? null);
  const [members, setMembers] = useState<string[]>(() => group?.members ?? []);
  const [problems, setProblems] = useState<Problems>({});
  const where = useMemo(() => new Map(here.filter(other => other.id !== group?.id).flatMap(other => other.members.map(member => [member, other.label] as const))), [here, group]);
  const placeOf = useCallback((personId: string) => where.get(personId) ?? null, [where]);

  function submit() {
    const input = { sessionId: session.id, kind, label, note, sort: sort ?? sortOf(label, here.length) };
    const checked = activityInputSchema.safeParse(input);
    const found: Problems = {};
    if (!checked.success) for (const issue of checked.error.issues) found[String(issue.path[0])] ??= issue.message;
    const same = here.find(other => other.id !== group?.id && other.label.trim().toLowerCase() === label.trim().toLowerCase());
    if (same) found.label = `${same.label} sudah ada di sesi ini.`;
    if (Object.keys(found).length) { setProblems(found); return; }
    onSave(checked.data!, members);
  }

  return <Sheet title={group ? `Ubah ${group.label}` : "Tambah kelompok kegiatan"} subtitle={`${session.title} · ${timeRange(session)}`} busy={busy} onClose={onClose} onSubmit={submit}
    footer={<>
      <ConsoleButton disabled={busy} onClick={onClose}>Batal</ConsoleButton>
      <ConsoleButton type="submit" variant="primary" disabled={busy}>{busy ? "Menyimpan…" : group ? "Simpan" : "Tambah"}</ConsoleButton>
    </>}>
    <Choice label="Jenis" name={`${id}-kind`} value={kind} onChange={setKind} options={ACTIVITY_GROUP_KINDS.map(value => ({ value, label: activityKindLabels[value] }))} />
    <div className={css.pair}>
      <Field id={`${id}-label`} label="Nama" error={problems.label}>
        <input className="input" {...described(`${id}-label`, problems.label)} value={label} maxLength={40} placeholder={`mis. ${kind === "angkot" ? "Angkot 3" : kind === "meja" ? "Meja 7" : "Pos 2"}`}
          onChange={event => { setLabel(event.target.value); setProblems({}); }} />
      </Field>
      <Field id={`${id}-sort`} label="Urutan" optional hint="Kosong: dari angka di namanya.">
        <NumberInput id={`${id}-sort`} integer value={sort} onChange={setSort} />
      </Field>
    </div>
    <Field id={`${id}-note`} label="Catatan" optional error={problems.note}>
      <input className="input" {...described(`${id}-note`, problems.note)} value={note} maxLength={200} placeholder="mis. Kumpul lobby 05.45" onChange={event => { setNote(event.target.value); setProblems({}); }} />
    </Field>
    <PeoplePicker people={people} selected={members} original={group?.members} onChange={setMembers} placeOf={placeOf} label="Orang" nobodyLabel={`Belum punya ${word[kind]}`} />
  </Sheet>;
}
