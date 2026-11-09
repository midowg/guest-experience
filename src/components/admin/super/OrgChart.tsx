import { Crown, UserRound, Users } from "lucide-react";
import { departmentShort } from "@/lib/employees";
import type { Org, OrgGroup, OrgNode, OrgPerson } from "@/lib/org";
import css from "./org-chart.module.css";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase()).join("");

function PersonCard({ person, tag, tagTitle, strong = false }: { person: OrgPerson; tag?: string; tagTitle?: string; strong?: boolean }) {
  return <div className={`${css.person} ${strong ? css.strong : ""}`}>
    <span className={css.avatar} aria-hidden>{initials(person.name)}</span>
    <span className={css.who}><strong>{person.name}</strong><small>{person.position || "Jabatan belum diisi"}</small></span>
    {tag && <span className={css.tag} title={tagTitle}>{tag}</span>}
  </div>;
}

function Branch({ nodes, root = false }: { nodes: OrgNode[]; root?: boolean }) {
  if (!nodes.length) return null;
  return <ul className={`${css.branch} ${root ? css.root : ""}`}>{nodes.map(node => <li key={node.id}>
    <PersonCard person={node} tag={node.lead ? "Lead" : undefined} />
    <Branch nodes={node.children} />
  </li>)}</ul>;
}

/** A department's sub-groups (no lead yet): a labelled box each, with its people. */
function Groups({ groups }: { groups: OrgGroup[] }) {
  if (!groups.length) return null;
  return <div className={css.groups}>{groups.map(group => <section key={group.name} className={css.group} aria-label={group.name}>
    <h3>{group.name} <span>{group.people.length}</span></h3>
    <Branch nodes={group.people} root />
  </section>)}</div>;
}

/**
 * Data karyawan → Struktur (6 Nov 2026): the organisation from Data karyawan, read only. BOD on
 * top, the BOD's own office (the Chief of Staff) under them, then a card per department with its
 * HOD and its people as a tree. A team's own branch comes from "Atasan langsung" in Ubah karyawan.
 */
export function OrgChart({ org }: { org: Org }) {
  return <div className={css.chart}>
    <p className={css.note}>Disusun dari pekerjaan utama di Data karyawan. Di bawah HOD ada <strong>Lead</strong> dengan anggotanya: di Ubah karyawan, anggota memilih Lead-nya di <strong>Di bawah</strong>. Yang tidak memilih ada langsung di bawah HOD. BU hanya unit usaha tempat orang itu berada.</p>

    <section className={css.level} aria-labelledby="org-bod">
      <h2 id="org-bod"><Crown size={18} aria-hidden /> BOD</h2>
      <div className={css.row}>{org.bod.length ? org.bod.map(person => <PersonCard key={person.id} person={person} tag="BOD" strong />) : <p className={css.empty}>Belum ada BOD. Centang BOD lewat Ubah karyawan.</p>}</div>
    </section>

    {org.staff.length > 0 && <>
      <span className={css.join} aria-hidden />
      <section className={css.level} aria-labelledby="org-staff">
        <h2 id="org-staff"><UserRound size={18} aria-hidden /> Kantor direksi</h2>
        <div className={css.row}>{org.staff.map(person => <PersonCard key={person.id} person={person} strong />)}</div>
      </section>
    </>}

    <span className={css.join} aria-hidden />
    <section className={css.level} aria-labelledby="org-departments">
      <h2 id="org-departments"><Users size={18} aria-hidden /> Departemen · {org.departments.length}</h2>
      <div className={css.departments}>{org.departments.map(department => <article key={department.name} className={css.department} aria-label={department.name}>
        <header>
          <strong>{department.name}</strong>
          <span className={css.meta}>{department.businessUnits.map(bu => <span key={bu} className={css.bu}>{bu}</span>)}<span>{department.size} orang</span></span>
        </header>
        {department.heads.length === 0 && <p className={css.empty}>Belum ada HOD.</p>}
        <ul className={css.branch}>{department.heads.map(head => <li key={head.id}>
          <PersonCard person={head} tag={head.department === department.name ? "HOD" : `HOD dari ${departmentShort(head.department)}`}
            tagTitle={head.department === department.name ? undefined : `HOD dari ${head.department}`} strong />
          <Branch nodes={head.children} />
          {department.heads.length === 1 && <Groups groups={department.groups} />}
        </li>)}</ul>
        <Branch nodes={department.loose} />
        {department.heads.length !== 1 && <Groups groups={department.groups} />}
      </article>)}</div>
    </section>
  </div>;
}
