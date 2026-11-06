import { BriefcaseBusiness, CalendarDays, CheckCircle2, ChevronRight, Clock, Lock, MinusCircle, Users, XCircle } from "lucide-react";
import { accountLabels, initials, percent, type AccountState, type ForumMark } from "@/lib/pra-wam/bod";
import { praWamPath } from "@/lib/routes";
import type { BodProfile, PeopleGroup } from "@/lib/server/pra-wam/dashboard";
import base from "./pra-wam.module.css";
import styles from "./bod.module.css";

// Status pills for the BOD pages (Penpot "DS / Status"): always an icon and words, never colour alone.

const accountLook: Record<AccountState, { className: string; icon: typeof CheckCircle2 }> = {
  aktif: { className: styles.statusSuccess, icon: CheckCircle2 },
  "belum-masuk": { className: styles.statusWarning, icon: Clock },
  "tanpa-akun": { className: styles.statusLine, icon: MinusCircle },
  nonaktif: { className: styles.statusLine, icon: MinusCircle },
};

export function AccountStatus({ state }: { state: AccountState }) {
  const { className, icon: Icon } = accountLook[state];
  return <span className={`${styles.status} ${className}`}><Icon aria-hidden />{accountLabels[state]}</span>;
}

const forumLook: Record<ForumMark, { className: string; icon: typeof CheckCircle2; label: string }> = {
  hadir: { className: styles.statusSuccess, icon: CheckCircle2, label: "hadir" },
  "tidak-hadir": { className: styles.statusDanger, icon: XCircle, label: "tidak hadir" },
  berlangsung: { className: styles.statusLine, icon: Clock, label: "sedang berlangsung, belum absen" },
};

/** One forum in a profile: the forum's name, with its mark spoken for screen readers. */
export function ForumStatus({ title, mark }: { title: string; mark: ForumMark }) {
  const { className, icon: Icon, label } = forumLook[mark];
  return <span className={`${styles.status} ${className}`} title={`${title}: ${label}`}><Icon aria-hidden />{title}<span className="sr-only">, {label}</span></span>;
}

/**
 * Peserta for BOD (design system "Pra WAM · Hospitality", 6 Nov 2026): four numbers on the
 * accounts, a row of department chips to jump with, then each department as a card with its
 * lead, BU, how many have signed in, and its people (one tap to the profile).
 */
export function BodPeopleList({ groups, total }: { groups: PeopleGroup[]; total: number }) {
  const everyone = [...new Map(groups.flatMap(group => group.people).map(person => [person.id, person])).values()];
  const count = (state: AccountState) => everyone.filter(person => person.account === state).length;
  const tiles: { value: number; label: string; note: string; dot: string }[] = [
    { value: total, label: "Peserta", note: `${groups.length} departemen`, dot: "var(--bod-c1)" },
    { value: count("aktif"), label: "Akun aktif", note: `${percent(count("aktif"), total)}% sudah pernah masuk`, dot: "var(--bod-c2)" },
    { value: count("belum-masuk"), label: "Belum pernah masuk", note: "Akun dibuat, belum dipakai", dot: "var(--bod-c3)" },
    { value: count("tanpa-akun") + count("nonaktif"), label: "Tanpa akun aktif", note: "Belum dibuat atau dinonaktifkan", dot: "var(--bod-c4)" },
  ];
  return <div className={styles.page}>
    <ul className={styles.tiles} aria-label="Ringkasan akun">{tiles.map(tile => <li key={tile.label}><div className={styles.tile}>
      <span className={styles.tileTop}><strong>{tile.value}</strong></span>
      <span className={styles.tileLabel}><i style={{ background: tile.dot }} aria-hidden />{tile.label}</span>
      <small>{tile.note}</small>
    </div></li>)}</ul>

    {groups.length > 1 && <nav className={styles.jump} aria-label="Lompat ke departemen">
      {groups.map(group => <a key={group.id} href={`#dep-${group.id}`}>{group.name}<small>{group.people.length}</small></a>)}
    </nav>}

    <div className={styles.groups}>{groups.map(group => {
      const signedIn = group.people.filter(person => person.account === "aktif").length;
      return <section key={group.id} className={`${base.card} ${styles.groupCard}`} aria-labelledby={`dep-${group.id}`}>
        <div className={styles.groupHead}>
          <div>
            <h2 id={`dep-${group.id}`}>{group.name}</h2>
            <span>{[`${group.people.length} orang`, group.businessUnits.join(", "), group.leads.length ? `Lead ${group.leads.join(", ")}` : "Lead belum ditentukan"].filter(Boolean).join(" · ")}</span>
          </div>
          <span className={styles.groupMeter}>
            <span className={styles.track} role="img" aria-label={`${signedIn} dari ${group.people.length} pernah masuk`}><span className={styles.fill} style={{ width: `${percent(signedIn, group.people.length)}%` }} /></span>
            <small>{signedIn}/{group.people.length} masuk</small>
          </span>
        </div>
        <ul className={styles.people}>{group.people.map(person => <li key={person.id}>
          <a className={styles.personRow} href={praWamPath.person(person.id)}>
            <span className={styles.initials} aria-hidden>{initials(person.name)}</span>
            <span><strong>{person.name}</strong>{(person.jobTitle || person.isLead) && <small>{[person.isLead ? "Lead" : "", person.jobTitle].filter(Boolean).join(" · ")}</small>}</span>
            <AccountStatus state={person.account} />
            <ChevronRight size={18} aria-hidden />
          </a>
        </li>)}</ul>
      </section>;
    })}</div>
  </div>;
}

const ATTENDANCE_MIGRATION = "202611040005_pra_wam_attendance.sql";

/**
 * Profil peserta seen by BOD (Penpot "B2", design system 6 Nov 2026): who they are, their
 * department, BU and position, and which Pra WAM forums they came to, with the share. Read only;
 * nothing personal beyond what the event needs.
 */
export function BodProfileView({ person, summary, viewerRole }: { person: BodProfile; summary: string; viewerRole: string }) {
  const departments = person.units.filter(unit => unit.kind === "departemen").map(unit => unit.name);
  const businessUnits = person.units.filter(unit => unit.kind === "bu").map(unit => unit.name);
  const place = [departments.length ? departments.join(", ") : person.department, businessUnits.join(", ")].filter(Boolean).join(" · ");
  const titles = [...new Set(person.units.map(unit => [unit.isLead ? "Lead" : "", unit.jobTitle].filter(Boolean).join(" · ")).filter(Boolean))];
  const position = titles.length ? titles.join(", ") : person.position;
  const attended = person.forums.filter(forum => forum.mark === "hadir").length;
  const missed = person.forums.filter(forum => forum.mark === "tidak-hadir").length;
  const first = person.name.split(" ")[0];

  return <div className={`${styles.page} ${styles.profile}`}>
    <section className={`${base.card} ${styles.identity}`} aria-label="Identitas">
      <span className={styles.avatarLarge} aria-hidden>{initials(person.name)}</span>
      <div>
        <h1>{person.name}</h1>
        <p>{[person.department, summary].filter(Boolean).join(" · ")}</p>
        <div className={styles.identityTags}><AccountStatus state={person.account} /><span className={styles.access}><Lock aria-hidden />Akses {viewerRole} · baca saja</span></div>
      </div>
    </section>

    <div className={styles.profileGrid}>
      <section className={base.card} aria-label="Unit dan jabatan">
        <div className={styles.info}>
          <div className={styles.infoRow}><span className={base.tile}><Users aria-hidden /></span><div><small>Departemen · BU</small><strong>{place || "Belum diisi"}</strong></div></div>
          <div className={styles.infoRow}><span className={base.tile}><BriefcaseBusiness aria-hidden /></span><div><small>Jabatan</small><strong>{position || "Belum diisi"}</strong></div></div>
          <div className={styles.infoRow}><span className={base.tile}><CalendarDays aria-hidden /></span><div><small>Forum terjadwal berikutnya</small><strong>{person.upcoming ? `${person.upcoming} forum lagi` : "Tidak ada"}</strong></div></div>
        </div>
      </section>

      <section className={base.card} aria-labelledby="kehadiran">
        <div className={styles.cardHead}><h2 id="kehadiran">Kehadiran forum Pra WAM</h2></div>
        {person.forums.length === 0
          ? <p className={styles.empty}>Belum ada forum yang dimulai untuk {first}.</p>
          : !person.attendanceReady
            ? <>
              <p className={styles.empty}>Absen belum aktif (menunggu migrasi {ATTENDANCE_MIGRATION}), jadi kehadiran belum tercatat.</p>
              <ul className={styles.plainList}>{person.forums.map(forum => <li key={forum.id}><a href={praWamPath.session(forum.id)}>{forum.title}</a></li>)}</ul>
            </>
            : <>
              <div className={styles.profileScore}>
                <strong>{percent(attended, person.forums.length)}%</strong>
                <span>{attended} dari {person.forums.length} forum dihadiri{missed ? ` · ${missed} terlewat` : ""}</span>
              </div>
              <span className={styles.scoreTrack}><span className={styles.track} role="img" aria-label={`${attended} dari ${person.forums.length} forum dihadiri`}><span className={styles.fill} style={{ width: `${percent(attended, person.forums.length)}%` }} /></span></span>
              <ul className={styles.forumChips}>{person.forums.map(forum => <li key={forum.id}>
                <a href={praWamPath.session(forum.id)}><ForumStatus title={forum.title} mark={forum.mark} /></a>
              </li>)}</ul>
            </>}
      </section>
    </div>
  </div>;
}
