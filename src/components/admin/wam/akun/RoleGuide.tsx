import { Link2, Lock } from "lucide-react";
import { Pill, SectionToolbar } from "@/components/console";
import { roleGuide, roleTones, type RoleGuideItem } from "./account-view";
import css from "./akun.module.css";

/**
 * Akun dan peran, tab Peran: a card per role with how many hold it, what it can do and what it
 * goes with. BOD stands alone (a lock). Roles are ticked in an account's detail on tab Akun.
 */
export function RoleGuide({ counts }: { counts: Record<RoleGuideItem["key"], number> | null }) {
  return <section className={css.section} aria-labelledby="semua-peran">
    <SectionToolbar title={<span id="semua-peran">Peran</span>} count={`${roleGuide.length} peran`} />
    <p className={css.lead}>Semua orang yang punya akun adalah peserta; peran lain ditambah dengan mencentangnya di detail akun. Panitia, Admin WAM, dan HOD bisa digabung; <strong>BOD berdiri sendiri</strong>. Perubahan peran berlaku di halaman berikutnya yang dibuka orang itu, tanpa perlu masuk ulang.</p>
    <ul className={css.roleGrid} aria-label="Peran dan gabungannya">{roleGuide.map(item => <li key={item.key}>
      <article className={css.roleCard} aria-labelledby={`peran-${item.key}`}>
        <div className={css.roleTop}>
          <Pill tone={roleTones[item.key]}>{item.label}</Pill>
          {counts && <span className={css.roleCount}>{counts[item.key]} orang</span>}
        </div>
        <h3 id={`peran-${item.key}`} className="sr-only">{item.label}</h3>
        <p className={css.roleDoes}>{item.does}</p>
        <p className={css.roleCombines}>{item.combines
          ? <><Link2 size={16} aria-hidden />Bisa digabung: {item.combines.join(", ")}</>
          : <><Lock size={16} aria-hidden />Tidak bisa digabung</>}</p>
      </article>
    </li>)}</ul>
  </section>;
}
