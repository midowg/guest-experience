"use client";

import { useCallback, useId, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardPaste, Eye, EyeOff, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { ConsoleButton, PageHeader, Pill, type Crumb } from "@/components/console";
import { adminRequest } from "@/components/admin/shared/api";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import {
  groupByPerson, groupColumnLabels, groupInputSchema, groupLabel, movesOut, nextGroupNumber, parseGroupPaste, ungrouped, type GroupInput, type GroupPaste, type GroupPasteRow,
} from "@/lib/main-wam/admin/groups";
import type { AdminPerson } from "@/lib/main-wam/admin/people";
import type { MainWamSettings, MwGroup } from "@/lib/main-wam/types";
import { mainWamAdminApi, mainWamAdminPath } from "@/lib/routes";
import { ContentTabs, described, Field, MessageLine, NumberInput, useRun, Waiting, type Message, type Problems } from "./fields";
import { PasteSheet } from "./PasteSheet";
import { PeoplePicker } from "./PeoplePicker";
import { Sheet, SheetError } from "./Sheet";
import css from "./isi.module.css";

type SheetState = { type: "edit"; group: MwGroup | null } | { type: "import" } | null;
type GroupsAnswer = { groups: MwGroup[]; id?: string };
const SHOWN_NAMES = 6;

/** Kelompok · Kelompok kegiatan (each its own address, mainWamAdminPath.groups / activityGroups). */
export function GroupSubtabs({ current }: { current: "kelompok" | "kegiatan" }) {
  return <nav className={css.subtabs} aria-label="Bagian kelompok">
    <Link href={mainWamAdminPath.groups} className={css.subtab} aria-current={current === "kelompok" ? "page" : undefined} scroll={false}>Kelompok</Link>
    <Link href={mainWamAdminPath.activityGroups} className={css.subtab} aria-current={current === "kegiatan" ? "page" : undefined} scroll={false}>Kelompok kegiatan</Link>
  </nav>;
}

/**
 * Admin WAM → Main WAM → Kelompok (agen E): kelompok with nomor, nama, koordinator and members
 * picked from Data karyawan (one kelompok per person; who has none is flagged), Impor from a pasted
 * sheet, and Terbitkan (participants see their kelompok only after it, L01).
 */
export function GroupsEditor({ initial, migrated, people, published: firstPublished, crumbs, title }: {
  initial: MwGroup[]; migrated: boolean; people: readonly AdminPerson[]; published: boolean; crumbs: readonly Crumb[]; title: string;
}) {
  const [groups, setGroups] = useState(initial);
  const [published, setPublished] = useState(firstPublished);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [message, setMessage] = useState<Message>(null);
  const { busy, run } = useRun(setMessage);
  const [confirm, confirmDialog] = useConfirm();
  const names = useMemo(() => new Map(people.map(person => [person.id, person])), [people]);
  const without = useMemo(() => ungrouped(people, groups), [people, groups]);
  const placed = people.length - without.length;
  const apply = (answer: GroupsAnswer) => setGroups([...answer.groups].sort((a, b) => a.number - b.number));
  const send = async (url: string, method: string, body?: unknown) => adminRequest<GroupsAnswer>(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });

  async function publish(next: boolean) {
    const ok = await confirm(next
      ? { title: "Terbitkan kelompok?", body: "Peserta melihat kelompok, koordinator, dan anggotanya di Saya → Kelompok & kamar. Perubahan sesudahnya langsung tampil.", confirmLabel: "Terbitkan" }
      : { title: "Sembunyikan kelompok?", body: "Peserta tidak lagi melihat kelompoknya sampai diterbitkan lagi.", confirmLabel: "Sembunyikan" });
    if (!ok) return;
    await run("terbit", async () => {
      const result = await adminRequest<MainWamSettings>(mainWamAdminApi.eventInfo, { method: "PUT", body: JSON.stringify({ groupsPublished: next }) });
      setPublished(result.data!.groupsPublished);
      return result.message;
    });
  }
  async function remove(group: MwGroup) {
    if (!(await confirm({ title: `Hapus ${groupLabel(group)}?`, body: `${group.members.length} anggotanya jadi belum punya kelompok.`, confirmLabel: "Hapus kelompok", danger: true }))) return;
    await run(`hapus-${group.id}`, async () => { const result = await send(mainWamAdminApi.group(group.id), "DELETE"); apply(result.data!); return result.message; });
  }
  const parse = useCallback((text: string) => parseGroupPaste(text, { people, groups }), [people, groups]);

  return <SheetError.Provider value={message?.tone === "error" ? message.text : null}><div className={css.page}>
    <PageHeader crumbs={crumbs} title={title} subtitle="Kelompok tampil di aplikasi peserta setelah diterbitkan."
      actions={<>
        <ConsoleButton icon={<ClipboardPaste size={18} aria-hidden />} disabled={!migrated} onClick={() => setSheet({ type: "import" })}>Impor</ConsoleButton>
        <ConsoleButton variant="primary" icon={<Plus size={18} aria-hidden />} disabled={!migrated} onClick={() => setSheet({ type: "edit", group: null })}>Tambah kelompok</ConsoleButton>
      </>} />
    <ContentTabs current="kelompok" />
    <GroupSubtabs current="kelompok" />
    {!migrated && <Waiting what="Kelompok" />}
    <MessageLine message={message} />

    <div className={css.toolbar}>
      <ul className={css.summary} aria-label="Ringkasan kelompok">
        <li><strong>{groups.length}</strong> kelompok</li>
        <li><strong>{placed}</strong> dari {people.length} orang punya kelompok</li>
        <li>{published ? <Pill tone="ok">Terbit</Pill> : <Pill tone="neutral">Belum terbit</Pill>}</li>
      </ul>
      <ConsoleButton variant={published ? "secondary" : "primary"} icon={published ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        disabled={!migrated || busy !== null || (!published && !groups.length)} onClick={() => void publish(!published)}>
        {busy === "terbit" ? "Menyimpan…" : published ? "Sembunyikan" : "Terbitkan"}
      </ConsoleButton>
    </div>

    {without.length > 0 && groups.length > 0 && <section className={css.item} aria-labelledby="mw-tanpa-kelompok">
      <div className={css.itemHead}>
        <h2 id="mw-tanpa-kelompok" className={css.itemTitle}>Belum punya kelompok</h2>
        <Pill tone="warn">{without.length} orang</Pill>
      </div>
      <p className={css.names}>{without.slice(0, 24).map(person => person.fullName).join(", ")}{without.length > 24 ? `, dan ${without.length - 24} lainnya` : ""}.</p>
    </section>}

    {groups.length ? <ul className={css.grid} aria-label="Daftar kelompok">
      {groups.map(group => {
        const coordinator = group.members.find(member => member.coordinator);
        const others = group.members.filter(member => !member.coordinator).map(member => names.get(member.employeeId)?.fullName ?? "Tanpa nama");
        return <li key={group.id} className={css.item}>
          <div className={css.itemHead}>
            <div>
              <h2 className={css.itemTitle}>{groupLabel(group)}</h2>
              <p className={css.itemSub}>{group.members.length} anggota</p>
            </div>
            <div className={css.actions}>
              <button type="button" className={css.iconButton} onClick={() => setSheet({ type: "edit", group })} disabled={busy !== null} aria-label={`Ubah ${groupLabel(group)}`} title="Ubah"><Pencil size={18} aria-hidden /></button>
              <button type="button" className={`${css.iconButton} ${css.iconDanger}`} onClick={() => void remove(group)} disabled={busy !== null} aria-label={`Hapus ${groupLabel(group)}`} title="Hapus"><Trash2 size={18} aria-hidden /></button>
            </div>
          </div>
          <p className={css.small}>Koordinator: <span className={css.strong}>{coordinator ? names.get(coordinator.employeeId)?.fullName ?? "Tanpa nama" : "belum dipilih"}</span></p>
          {others.length > 0 ? <p className={css.names}>{others.slice(0, SHOWN_NAMES).join(", ")}{others.length > SHOWN_NAMES ? `, dan ${others.length - SHOWN_NAMES} lainnya` : ""}</p>
            : <p className={css.small}>{group.members.length ? "Belum ada anggota lain." : "Belum ada anggota."}</p>}
        </li>;
      })}
    </ul> : <div className={css.empty}>
      <UsersRound size={24} aria-hidden />
      <h2>{migrated ? "Belum ada kelompok" : "Kelompok belum bisa diisi"}</h2>
      <p>{migrated ? "Tempel pembagian kelompok dari Excel (nomor, nama kelompok, nama karyawan, koordinator), atau tambah satu per satu." : "Halaman ini terbuka lagi setelah pembaruan sistem dijalankan."}</p>
      {migrated && <div className={css.emptyActions}>
        <ConsoleButton variant="primary" icon={<ClipboardPaste size={18} aria-hidden />} onClick={() => setSheet({ type: "import" })}>Impor</ConsoleButton>
        <ConsoleButton icon={<Plus size={18} aria-hidden />} onClick={() => setSheet({ type: "edit", group: null })}>Tambah kelompok</ConsoleButton>
      </div>}
    </div>}

    {sheet?.type === "edit" && <GroupSheet group={sheet.group} groups={groups} people={people} busy={busy === "simpan"} onClose={() => setSheet(null)}
      onSave={(input, employeeIds, coordinatorId) => void run("simpan", async () => {
        let id = sheet.group?.id;
        if (!sheet.group) { const created = await send(mainWamAdminApi.groups, "POST", { action: "tambah", group: input }); id = created.data!.id; apply(created.data!); }
        else if (sheet.group.number !== input.number || sheet.group.name !== input.name) apply((await send(mainWamAdminApi.group(sheet.group.id), "PUT", input)).data!);
        const result = await send(mainWamAdminApi.groupMembers(id!), "PUT", { employeeIds, coordinatorId });
        apply(result.data!);
        setSheet(null);
        return `${groupLabel(input)} tersimpan.`;
      })} />}
    {sheet?.type === "import" && <PasteSheet<GroupPasteRow, GroupPaste> title="Impor kelompok"
      subtitle="Satu orang per baris. Kelompok yang ada di tempelan berisi persis orang-orang di tempelan; kelompok lain tidak berubah."
      columns={groupColumnLabels} parse={parse} busy={busy === "impor"}
      example={"Kelompok\tNama kelompok\tNama karyawan\tKoordinator\n4\tArjuno\tFajar Contoh\tya\n4\tArjuno\tRani Contoh\t"}
      heads={["Kelompok", "Nama karyawan", "Koordinator", "Catatan"]}
      cells={input => {
        const moving = movesOut(input.personId, input.number, groups);
        return [`${input.number}${input.name ? ` · ${input.name}` : ""}`, names.get(input.personId)?.fullName ?? "", input.coordinator ? "Ya" : "", moving ? `Pindah dari ${groupLabel(moving)}` : ""];
      }}
      saveLabel={count => `Simpan ${count} orang`}
      onClose={() => setSheet(null)}
      onSave={parsed => void run("impor", async () => {
        const result = await send(mainWamAdminApi.groups, "POST", { action: "impor", groups: parsed.groups });
        apply(result.data!);
        setSheet(null);
        return result.message;
      })} />}
    {confirmDialog}
  </div></SheetError.Provider>;
}

/** Tambah kelompok / Ubah kelompok: nomor, nama, anggota, koordinator; one Simpan. */
function GroupSheet({ group, groups, people, busy, onClose, onSave }: {
  group: MwGroup | null; groups: readonly MwGroup[]; people: readonly AdminPerson[]; busy: boolean;
  onClose: () => void; onSave: (input: GroupInput, employeeIds: string[], coordinatorId: string | null) => void;
}) {
  const id = useId();
  const [number, setNumber] = useState<number | null>(group?.number ?? nextGroupNumber(groups));
  const [name, setName] = useState(group?.name ?? "");
  const [members, setMembers] = useState<string[]>(() => group?.members.map(member => member.employeeId) ?? []);
  const [coordinator, setCoordinator] = useState<string | null>(() => group?.members.find(member => member.coordinator)?.employeeId ?? null);
  const [problems, setProblems] = useState<Problems>({});
  const byPerson = useMemo(() => groupByPerson(groups), [groups]);
  const placeOf = useCallback((personId: string) => {
    const now = byPerson.get(personId);
    return now && now.id !== group?.id ? groupLabel(now) : null;
  }, [byPerson, group]);
  const chosen = people.filter(person => members.includes(person.id));
  const moving = members.filter(personId => placeOf(personId)).length;
  const taken = groups.find(other => other.number === number && other.id !== group?.id);

  function submit() {
    const checked = groupInputSchema.safeParse({ number, name });
    const found: Problems = {};
    if (!checked.success) for (const issue of checked.error.issues) found[String(issue.path[0])] ??= issue.message;
    if (taken) found.number = `Nomor ${number} sudah dipakai ${groupLabel(taken)}.`;
    if (Object.keys(found).length) { setProblems(found); return; }
    onSave(checked.data!, members, coordinator && members.includes(coordinator) ? coordinator : null);
  }

  return <Sheet title={group ? "Ubah kelompok" : "Tambah kelompok"} subtitle={group ? groupLabel(group) : "Satu orang hanya di satu kelompok."} busy={busy} onClose={onClose} onSubmit={submit}
    footer={<>
      <ConsoleButton disabled={busy} onClick={onClose}>Batal</ConsoleButton>
      <ConsoleButton type="submit" variant="primary" disabled={busy}>{busy ? "Menyimpan…" : group ? "Simpan" : "Tambah kelompok"}</ConsoleButton>
    </>}>
    <div className={css.pair}>
      <Field id={`${id}-number`} label="Nomor" error={problems.number}>
        <NumberInput id={`${id}-number`} integer value={number} onChange={value => { setNumber(value); setProblems({}); }} error={problems.number} />
      </Field>
      <Field id={`${id}-name`} label="Nama kelompok" error={problems.name}>
        <input className="input" {...described(`${id}-name`, problems.name)} value={name} maxLength={40} placeholder="mis. Arjuno" onChange={event => { setName(event.target.value); setProblems({}); }} />
      </Field>
    </div>
    <PeoplePicker people={people} selected={members} original={group?.members.map(member => member.employeeId)} onChange={ids => { setMembers(ids); if (coordinator && !ids.includes(coordinator)) setCoordinator(null); }} placeOf={placeOf} />
    {moving > 0 && <p className={css.hint}>{moving} orang pindah dari kelompok lain saat disimpan.</p>}
    <Field id={`${id}-coordinator`} label="Koordinator" optional hint={chosen.length ? "Dipilih dari anggota kelompok ini." : "Pilih anggota dulu."}>
      <select className="select" {...described(`${id}-coordinator`, undefined, true)} value={coordinator ?? ""} disabled={!chosen.length} onChange={event => setCoordinator(event.target.value || null)}>
        <option value="">Belum dipilih</option>
        {chosen.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}
      </select>
    </Field>
  </Sheet>;
}
