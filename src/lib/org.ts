/*
 * Struktur (Data karyawan, 6 Nov 2026): the organisation as a tree, from Data karyawan alone.
 *   1. BOD at the top (Managing Director, CEO).
 *   2. Under them the people of the BOD's own department (Corporate: the Chief of Staff) and anyone
 *      whose Atasan langsung is a BOD.
 *   3. Then every other department as a card: its HOD(s), from this department or another one, and its people as a tree. A person whose
 *      Atasan langsung is in the same department hangs under them (a Business Solutions Manager's
 *      team); everyone else hangs under the HOD (or at the department's top when it has none).
 *   4. A big department's people are grouped by what their position says (SUB_GROUPS: Sales &
 *      Marketing's Business Solutions, Commercial, Creative & Content). A group has no lead yet;
 *      it only gathers the people the HOD would otherwise hold in one long list.
 * Pure, so the page and the tests read the same rule.
 */

/**
 * `lead`: a Lead (9 Nov 2026): a team lead under the HOD, whose people point at them in Atasan langsung.
 * `post` and `unit` (10 Nov 2026, the org chart): GM or HOD of their Utama job, and its team.
 */
export type OrgPerson = { id: string; name: string; position: string; department: string; businessUnit: string; reportsTo: string | null; lead?: boolean; post?: "gm" | "hod" | "lead" | "staf"; unit?: string };
export type OrgNode = OrgPerson & { children: OrgNode[] };
export type OrgGroup = { name: string; people: OrgNode[] };
export type OrgDepartment = { name: string; businessUnits: string[]; heads: OrgNode[]; loose: OrgNode[]; groups: OrgGroup[]; size: number };
export type Org = { bod: OrgPerson[]; staff: OrgPerson[]; departments: OrgDepartment[] };

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "id", { sensitivity: "base" });

/**
 * The sub-groups of a department, read from the position (6 Nov 2026, from the Sales & Marketing
 * positions in Data karyawan). Checked in order, the first match wins: "Commercial Creative
 * Designer" is Creative & Content, "Business Solutions & Commercial Coordinator" Business Solutions.
 */
export const SUB_GROUPS: Record<string, { name: string; match: RegExp }[]> = {
  "Sales & Marketing": [
    { name: "Business Solutions", match: /business solution/i },
    { name: "Creative & Content", match: /creative|content|designer|social media/i },
    { name: "Commercial", match: /commercial|costing|pricing/i },
  ],
};

/** The sub-group a position falls in within its department, or null. */
export function subGroupOf(department: string, position: string): string | null {
  return SUB_GROUPS[department]?.find(group => group.match.test(position))?.name ?? null;
}

/**
 * `bodIds`: who is BOD. `headsOf`: per department name, the ids of its HODs (from what people head).
 * `buOrder`: the business units in their listed order, to sort the departments by.
 */
export function buildOrg(people: OrgPerson[], bodIds: ReadonlySet<string>, headsOf: Record<string, string[]>, buOrder: readonly string[] = []): Org {
  const bod = people.filter(person => bodIds.has(person.id)).sort(byName);
  const bodDepartments = new Set(bod.map(person => person.department));
  const staff = people.filter(person => !bodIds.has(person.id) && (bodDepartments.has(person.department) || (person.reportsTo != null && bodIds.has(person.reportsTo)))).sort(byName);
  const placed = new Set([...bod, ...staff].map(person => person.id));

  const rest = people.filter(person => !placed.has(person.id));
  const names = [...new Set(rest.map(person => person.department || "Tanpa departemen"))];
  const rank = (bu: string) => { const at = buOrder.indexOf(bu); return at < 0 ? buOrder.length : at; };

  const departments = names.map(name => {
    const members = rest.filter(person => (person.department || "Tanpa departemen") === name);
    const ids = new Set(members.map(person => person.id));
    // A HOD may sit in another department (Sofyan: CoE and Art & Creative Support); they head this card too.
    const allHeads = people.filter(person => !bodIds.has(person.id) && (headsOf[name] ?? []).includes(person.id));
    const allHeadIds = new Set(allHeads.map(person => person.id));
    // A HOD under another head of this department (Commercial's HOD under the GM of Sales &
    // Marketing, 10 Nov 2026) is no head of the card: they hang in it with their own people.
    const heads = allHeads.filter(person => !(members.includes(person) && person.reportsTo && person.reportsTo !== person.id && allHeadIds.has(person.reportsTo))).sort(byName);
    const headIds = new Set(heads.map(person => person.id));
    // Each person's parent inside this department: their Atasan langsung when it is here (and not a
    // loop), else none. Under a head of the card counts as none: they hang under the head anyway, and
    // so they can still be sorted into their team.
    const parentOf = new Map<string, string | null>();
    for (const person of members) {
      if (headIds.has(person.id)) { parentOf.set(person.id, null); continue; }
      parentOf.set(person.id, person.reportsTo && ids.has(person.reportsTo) && person.reportsTo !== person.id && !headIds.has(person.reportsTo) ? person.reportsTo : null);
    }
    // A loop (A under B under A) is cut: the person whose chain comes back to them goes to the top.
    for (const person of members) {
      const seen = new Set<string>([person.id]);
      let up = parentOf.get(person.id);
      while (up) {
        if (seen.has(up)) { parentOf.set(person.id, null); break; }
        seen.add(up);
        up = parentOf.get(up) ?? null;
      }
    }
    const node = (person: OrgPerson): OrgNode => ({
      ...person,
      children: members.filter(other => !headIds.has(other.id) && parentOf.get(other.id) === person.id).sort(byName).map(node),
    });
    const allTops = members.filter(person => !headIds.has(person.id) && !parentOf.get(person.id)).sort(byName);
    // The teams (Tim) set in Data karyawan, when this department has any (10 Nov 2026); else the
    // sub-groups read from the position. The tops of a team go into it; the rest stay as before.
    const teams = [...new Set(members.map(person => person.unit?.trim() ?? "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));
    const groups: OrgGroup[] = (teams.length
      ? teams.map(team => ({ name: team, people: allTops.filter(person => person.unit?.trim() === team).map(node) }))
      : (SUB_GROUPS[name] ?? []).map(group => ({ name: group.name, people: allTops.filter(person => subGroupOf(name, person.position) === group.name).map(node) })))
      .filter(group => group.people.length > 0);
    const grouped = new Set(groups.flatMap(group => group.people.map(person => person.id)));
    const tops = allTops.filter(person => !grouped.has(person.id));
    // With one HOD the loose people hang under them; with none, or several, they sit at the card's top.
    const headNodes = heads.map(node);
    let loose = tops.map(node);
    if (headNodes.length === 1) { headNodes[0] = { ...headNodes[0], children: [...headNodes[0].children, ...loose].sort(byName) }; loose = []; }
    const businessUnits = [...new Set(members.map(person => person.businessUnit).filter(Boolean))].sort((a, b) => rank(a) - rank(b));
    return { name, businessUnits, heads: headNodes, loose, groups, size: members.length };
  }).sort((a, b) => rank(a.businessUnits[0] ?? "") - rank(b.businessUnits[0] ?? "") || a.name.localeCompare(b.name, "id"));

  return { bod, staff, departments };
}
