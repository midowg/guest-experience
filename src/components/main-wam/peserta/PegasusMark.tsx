import css from "./pegasus-mark.module.css";

/**
 * The pegasus of dots as the screen's watermark (prototipe .wm: Beranda and Notifikasi): low at the right,
 * half out of the column, soft, behind everything. Fixed while the screen scrolls. Light art for Terang,
 * dark art for Gelap (chosen by CSS, no flash). Decorative; it replaces the shell's konstelasi art on the screen
 * that draws it (the shell looks for data-mw-pegasus).
 */
export function PegasusMark() {
  return <div className={css.mark} data-mw-pegasus="" aria-hidden>
    {/* eslint-disable-next-line @next/next/no-img-element -- static SVG art */}
    <img className={css.light} src="/wam/pegasus-jaringan-terang.svg" alt="" width={360} />
    {/* eslint-disable-next-line @next/next/no-img-element -- static SVG art */}
    <img className={css.dark} src="/wam/pegasus-jaringan-gelap.svg" alt="" width={360} />
  </div>;
}
