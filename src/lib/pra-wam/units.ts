/*
 * Werkudara's units (departments and BUs) and who is in them, read from the "Unit dan jabatan"
 * sheet of the Data karyawan workbook: one row per person per unit role. A person may appear
 * several times for one unit (their title, and "Lead departemen" from a later decision); those
 * rows become one membership that remembers the title, the lead, and whether it is their own unit.
 */

export type UnitKind = "departemen" | "bu";
export type UnitRow = { kind: UnitKind; name: string; code: string | null };
export type MemberRow = { nip: string; nickname: string; kind: UnitKind; unit: string; jobTitle: string; isLead: boolean; isPrimary: boolean };
export type ParsedUnits = { sheet: string; units: UnitRow[]; members: MemberRow[]; skipped: string[] };

const norm = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ");
const kindOf = (value: string): UnitKind | null => /^dep/i.test(value) ? "departemen" : /^(bu|business unit)$/i.test(value) ? "bu" : null;
/** Titles that only say someone belongs to or leads the unit, not what they do. */
const plainTitle = (title: string) => /^(anggota|lead\b.*)$/i.test(title);

export function unitsFromSheets(sheets: { name: string; rows: string[][] }[]): ParsedUnits {
  const codes = new Map<string, string>();
  // The optional "Unit" sheet: Jenis, Nama unit, Kode.
  for (const sheet of sheets) {
    const head = sheet.rows[0]?.map(cell => norm(cell).toUpperCase()) ?? [];
    const [kindAt, nameAt, codeAt] = [head.indexOf("JENIS"), head.indexOf("NAMA UNIT"), head.indexOf("KODE")];
    if (kindAt < 0 || nameAt < 0 || codeAt < 0) continue;
    for (const row of sheet.rows.slice(1)) {
      const kind = kindOf(norm(row[kindAt])), code = norm(row[codeAt]);
      if (kind && code) codes.set(`${kind}|${norm(row[nameAt])}`, code.slice(0, 12));
    }
  }
  for (const sheet of sheets) {
    const headerAt = sheet.rows.findIndex(row => row.some(cell => norm(cell).toUpperCase() === "JENIS UNIT") && row.some(cell => norm(cell).toUpperCase() === "UNIT"));
    if (headerAt < 0) continue;
    const head = sheet.rows[headerAt].map(cell => norm(cell).toUpperCase());
    const at = (name: string) => head.indexOf(name);
    const col = { nip: at("NIP"), nickname: at("NAMA PANGGILAN"), kind: at("JENIS UNIT"), unit: at("UNIT"), title: at("JABATAN DI UNIT"), primary: at("UTAMA") };
    const units = new Map<string, UnitRow>();
    const members = new Map<string, MemberRow>();
    const skipped: string[] = [];
    sheet.rows.slice(headerAt + 1).forEach((row, index) => {
      const cell = (position: number) => (position < 0 ? "" : norm(row[position]));
      const nickname = cell(col.nickname), nip = cell(col.nip), unit = cell(col.unit), title = cell(col.title);
      const kind = kindOf(cell(col.kind));
      if (!nickname && !nip && !unit) return;
      if (!kind || unit.length < 2 || (!nickname && !nip)) { skipped.push(`Baris ${headerAt + index + 2}: jenis unit, unit, atau nama kosong.`); return; }
      const unitKey = `${kind}|${unit}`;
      if (!units.has(unitKey)) units.set(unitKey, { kind, name: unit, code: codes.get(unitKey) ?? (kind === "bu" ? unit.slice(0, 12) : null) });
      const key = `${(nip || nickname).toLowerCase()}|${unitKey}`;
      const known = members.get(key) ?? { nip, nickname, kind, unit, jobTitle: "", isLead: false, isPrimary: false };
      if (title && !plainTitle(title) && !known.jobTitle) known.jobTitle = title.slice(0, 150);
      if (/^lead\b/i.test(title)) known.isLead = true;
      if (/^(ya|y|yes|utama|1)$/i.test(cell(col.primary))) known.isPrimary = true;
      members.set(key, known);
    });
    return { sheet: sheet.name, units: [...units.values()], members: [...members.values()], skipped };
  }
  return { sheet: "", units: [], members: [], skipped: [] };
}

type GroupPerson = { id: string; department: string };
type GroupUnit = { id: string; kind: UnitKind; name: string; code: string | null };
type GroupMembership = { unitId: string; employeeId: string; isLead: boolean };

/**
 * The chips of the participant picker. With units imported: every department and BU with its
 * people, so someone in two units shows under both; the viewer's own units first, the ones they
 * lead before the rest. Without units yet: the department column of Data karyawan.
 */
export function participantGroups(people: GroupPerson[], viewerId: string, units: GroupUnit[] = [], memberships: GroupMembership[] = []) {
  const known = new Set(people.map(person => person.id));
  const mine = (unitId: string) => memberships.find(member => member.unitId === unitId && member.employeeId === viewerId);
  if (units.length && memberships.length) {
    return units
      .map(unit => ({ id: unit.id, label: unit.code && unit.code !== unit.name ? unit.code : unit.name, title: unit.name, kind: unit.kind, memberIds: memberships.filter(member => member.unitId === unit.id && known.has(member.employeeId)).map(member => member.employeeId) }))
      .filter(group => group.memberIds.length > 0)
      .sort((a, b) => {
        const rank = (id: string) => (mine(id)?.isLead ? 0 : mine(id) ? 1 : 2);
        return rank(a.id) - rank(b.id) || (a.kind === b.kind ? 0 : a.kind === "departemen" ? -1 : 1) || a.title.localeCompare(b.title);
      })
      .map(({ id, label, memberIds }) => ({ id, label, memberIds }));
  }
  const own = people.find(person => person.id === viewerId)?.department;
  return [...new Set(people.map(person => person.department).filter(Boolean))]
    .sort((a, b) => (a === own ? -1 : b === own ? 1 : a.localeCompare(b)))
    .map(name => ({ id: `departemen:${name}`, label: name, memberIds: people.filter(person => person.department === name).map(person => person.id) }));
}
