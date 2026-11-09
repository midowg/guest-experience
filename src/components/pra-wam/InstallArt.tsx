"use client";

import { useId, type ReactNode } from "react";
import css from "./install-art.module.css";

/*
 * "Pasang WAM di perangkatmu" (9 Nov 2026): one small drawing per step, a phone or a laptop
 * browser sketched flat (not a screenshot, no brand artwork), with the one thing to tap in blue
 * and a tap circle on it. Labels are the makers' own Indonesian names (Apple id-id, Google hl=id);
 * Samsung gives none, so its "Home screen" stays in English. Anything unverified is a grey bar.
 */

export type ArtKind =
  | "ios-more" | "ios-share-menu" | "ios-share-chrome" | "ios-add" | "ios-webapp"
  | "android-menu" | "android-install" | "android-confirm"
  | "samsung-menu" | "samsung-plus" | "samsung-add"
  | "desktop-install" | "desktop-dialog"
  | "home-icon" | "wam-notif" | "allow-prompt"
  | "ios-settings-notif" | "android-settings-notif" | "desktop-site-notif";

/* ---- Pieces -------------------------------------------------------------------------------- */

function Phone({ label, children }: { label: string; children: ReactNode }) {
  return <svg className={`${css.art} ${css.phone}`} viewBox="0 0 120 220" role="img" aria-label={label}>
    <rect className={css.body} x="2" y="2" width="116" height="216" rx="18" />
    <rect className={css.screen} x="7" y="7" width="106" height="206" rx="13" />
    <rect className={css.notch} x="47" y="11" width="26" height="6" rx="3" />
    {children}
  </svg>;
}

function Desktop({ label, children }: { label: string; children: ReactNode }) {
  return <svg className={`${css.art} ${css.desktop}`} viewBox="0 0 220 140" role="img" aria-label={label}>
    <rect className={css.body} x="2" y="2" width="216" height="136" rx="8" />
    <rect className={css.screen} x="3" y="40" width="214" height="97" rx="0" />
    <circle className={css.bar} cx="12" cy="11" r="2.5" />
    <circle className={css.bar} cx="20" cy="11" r="2.5" />
    <circle className={css.bar} cx="28" cy="11" r="2.5" />
    <rect className={css.card} x="40" y="5" width="56" height="12" rx="4" />
    <rect className={css.bar} x="46" y="9.5" width="34" height="3" rx="1.5" />
    {children}
  </svg>;
}

/** Text in viewBox units; `tone` picks the colour. */
function T({ x, y, size = 7, tone = "text", anchor, children }: { x: number; y: number; size?: number; tone?: "text" | "muted" | "hi"; anchor?: "start" | "middle" | "end"; children: ReactNode }) {
  const cls = tone === "hi" ? css.hiText : tone === "muted" ? css.muted : css.text;
  return <text className={cls} x={x} y={y} fontSize={size} textAnchor={anchor}>{children}</text>;
}

/**
 * Where to tap: a small dot with a soft wave, set at the lower right of the target like a
 * fingertip, so the word or icon it points at stays readable.
 */
function Tap({ x, y }: { x: number; y: number }) {
  const cx = x + 6, cy = y + 5;
  return <g aria-hidden>
    <circle className={css.tapWave} cx={cx} cy={cy} r="6" />
    <circle className={css.tapCore} cx={cx} cy={cy} r="2.2" />
    <circle className={css.tapEdge} cx={cx} cy={cy} r="2.2" />
  </g>;
}

/** The WAM icon, rounded like an app icon. */
function Icon({ x, y, s }: { x: number; y: number; s: number }) {
  const id = `wam-icon-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return <g>
    <clipPath id={id}><rect x={x} y={y} width={s} height={s} rx={s * .24} /></clipPath>
    <rect className={css.tile} x={x} y={y} width={s} height={s} rx={s * .24} />
    <image href="/wam/icon-192.png" x={x} y={y} width={s} height={s} clipPath={`url(#${id})`} preserveAspectRatio="xMidYMid slice" />
  </g>;
}

function Switch({ x, y, on = true }: { x: number; y: number; on?: boolean }) {
  return <g>
    <rect className={on ? css.switchOn : css.switchOff} x={x} y={y} width="17" height="10" rx="5" />
    <circle className={css.knob} cx={on ? x + 12 : x + 5} cy={y + 5} r="3.8" />
  </g>;
}

/** A menu row inside a card: plain, or the highlighted one. */
function Row({ x = 12, y, w = 96, label, hi, size, children }: { x?: number; y: number; w?: number; label?: string; hi?: boolean; size?: number; children?: ReactNode }) {
  return <g>
    {hi && <rect className={css.hi} x={x + 2} y={y} width={w - 4} height="15" rx="4" />}
    {label ? <T x={x + 7} y={y + 10} size={size} tone={hi ? "hi" : "text"}>{label}</T> : <rect className={css.bar} x={x + 7} y={y + 6} width={w * .5} height="3.5" rx="1.75" />}
    {children}
  </g>;
}

/** Grey lines standing for the page behind. */
function Page({ top = 30, bottom = 180 }: { top?: number; bottom?: number }) {
  const lines: number[] = [];
  for (let y = top; y < bottom; y += 14) lines.push(y);
  return <g>
    <rect className={css.accent} x="14" y={top} width="92" height="26" rx="6" />
    {lines.slice(3).map((y, index) => <rect key={y} className={css.bar} x="14" y={y} width={index % 3 === 2 ? 56 : 88} height="4" rx="2" />)}
  </g>;
}

const Dim = () => <rect className={css.dim} x="7" y="7" width="106" height="206" rx="13" />;

/* ---- The drawings --------------------------------------------------------------------------- */

const drawings: Record<ArtKind, () => ReactNode> = {
  "ios-more": () => <Phone label="Safari di iPhone: ketuk tombol titik tiga di bilah bawah">
    <Page top={26} bottom={176} />
    <rect className={css.card} x="12" y="186" width="96" height="20" rx="10" />
    <path className={css.glyph} d="M23 192 l-4 4 l4 4" />
    <T x={56} y={198.5} size={7} anchor="middle">werkudara.group</T>
    <circle className={css.hi} cx="98" cy="196" r="7" />
    <circle className={css.hiDot} cx="95" cy="196" r="1" /><circle className={css.hiDot} cx="98" cy="196" r="1" /><circle className={css.hiDot} cx="101" cy="196" r="1" />
    <Tap x={98} y={196} />
  </Phone>,

  "ios-share-menu": () => <Phone label="Menu Safari: ketuk Bagikan">
    <Page top={26} bottom={120} />
    <Dim />
    <rect className={css.card} x="12" y="116" width="96" height="90" rx="10" />
    <Row y={122} />
    <Row y={140} label="Bagikan" hi>
      <path className={css.hiGlyph} d="M96 151 v-7 M93 147 l3 -3 l3 3 M92 149 h-1 v5 h10 v-5 h-1" />
    </Row>
    <Row y={158} />
    <Row y={176} />
    <Tap x={96} y={147} />
  </Phone>,

  "ios-share-chrome": () => <Phone label="Chrome di iPhone: ketuk ikon Bagikan di kanan bilah alamat">
    <rect className={css.card} x="12" y="22" width="96" height="18" rx="9" />
    <T x={18} y={33.5} size={7}>werkudara.group</T>
    <circle className={css.hi} cx="98" cy="31" r="7" />
    <path className={css.hiGlyph} d="M98 33 v-6 M95.5 29.5 l2.5 -2.5 l2.5 2.5 M94.5 31 v4 h7 v-4" />
    <Tap x={98} y={31} />
    <Page top={50} bottom={205} />
  </Phone>,

  "ios-add": () => <Phone label="Daftar Bagikan: ketuk Tambah ke Layar Utama">
    <Page top={26} bottom={90} />
    <Dim />
    <rect className={css.card} x="12" y="88" width="96" height="118" rx="10" />
    <circle className={css.bar} cx="27" cy="104" r="7" /><circle className={css.bar} cx="47" cy="104" r="7" /><circle className={css.bar} cx="67" cy="104" r="7" /><circle className={css.bar} cx="87" cy="104" r="7" />
    <Row y={118} />
    <Row y={136} />
    <Row y={154} label="Tambah ke Layar Utama" size={5.8} hi>
      <rect className={css.hiGlyph} x="94" y="157" width="9" height="9" rx="2" />
      <path className={css.hiGlyph} d="M98.5 159 v5 M96 161.5 h5" />
    </Row>
    <Row y={172} />
    <Row y={188} />
    <Tap x={98.5} y={161.5} />
  </Phone>,

  "ios-webapp": () => <Phone label="Layar Tambah ke Layar Utama: Buka sebagai App Web menyala, lalu ketuk Tambah">
    <rect className={css.bar} x="14" y="29" width="20" height="4" rx="2" />
    <rect className={css.bar} x="46" y="29" width="28" height="4" rx="2" />
    <rect className={css.hi} x="78" y="25" width="30" height="13" rx="6" />
    <T x={93} y={34} size={6.5} tone="hi" anchor="middle">Tambah</T>
    <Tap x={102} y={33} />
    <rect className={css.card} x="12" y="46" width="96" height="40" rx="8" />
    <Icon x={18} y={53} s={24} />
    <T x={48} y={63} size={8}>WAM</T>
    <rect className={css.bar} x="48" y="69" width="50" height="3.5" rx="1.75" />
    <rect className={css.card} x="12" y="94" width="96" height="20" rx="8" />
    <T x={17} y={107} size={5.8}>Buka sebagai App Web</T>
    <Switch x={86} y={99} />
    <rect className={css.bar} x="14" y="122" width="80" height="3.5" rx="1.75" />
    <rect className={css.bar} x="14" y="130" width="60" height="3.5" rx="1.75" />
  </Phone>,

  "android-menu": () => <Phone label="Chrome di Android: ketuk tombol titik tiga di kanan bilah alamat">
    <rect className={css.card} x="12" y="22" width="80" height="16" rx="8" />
    <T x={19} y={32.5} size={7}>werkudara.group</T>
    <circle className={css.hi} cx="102" cy="30" r="7" />
    <circle className={css.hiDot} cx="102" cy="26.5" r="1" /><circle className={css.hiDot} cx="102" cy="30" r="1" /><circle className={css.hiDot} cx="102" cy="33.5" r="1" />
    <Tap x={102} y={30} />
    <Page top={48} bottom={205} />
  </Phone>,

  "android-install": () => <Phone label="Menu Chrome: ketuk Instal dan buat pintasan">
    <rect className={css.card} x="12" y="22" width="80" height="16" rx="8" />
    <Page top={48} bottom={205} />
    <rect className={css.card} x="22" y="22" width="88" height="140" rx="8" />
    <Row x={22} y={28} w={88} />
    <Row x={22} y={45} w={88} />
    <Row x={22} y={62} w={88} />
    <Row x={22} y={79} w={88} />
    <Row x={22} y={96} w={88} />
    <Row x={22} y={113} w={88} label="Instal dan buat pintasan" size={5.8} hi />
    <Row x={22} y={130} w={88} />
    <Tap x={98} y={120.5} />
  </Phone>,

  "android-confirm": () => <Phone label="Jendela pemasangan: ketuk Instal">
    <Page top={26} bottom={205} />
    <Dim />
    <rect className={css.card} x="14" y="70" width="92" height="82" rx="10" />
    <rect className={css.bar} x="22" y="80" width="40" height="4" rx="2" />
    <Icon x={22} y={94} s={22} />
    <T x={50} y={104} size={8}>WAM</T>
    <rect className={css.bar} x="50" y="109" width="44" height="3.5" rx="1.75" />
    <rect className={css.bar} x="42" y="135" width="22" height="4" rx="2" />
    <rect className={css.hi} x="70" y="130" width="30" height="14" rx="7" />
    <T x={85} y={140} size={7} tone="hi" anchor="middle">Instal</T>
    <Tap x={85} y={137} />
  </Phone>,

  "samsung-menu": () => <Phone label="Samsung Internet: ketuk tombol tiga garis di kanan bawah">
    <rect className={css.card} x="12" y="22" width="96" height="16" rx="8" />
    <Page top={48} bottom={180} />
    <rect className={css.card} x="7" y="188" width="106" height="20" rx="0" />
    <path className={css.glyph} d="M20 194 l-4 4 l4 4 M36 194 l4 4 l-4 4" />
    <path className={css.glyph} d="M54 202 v-5 l5 -4 l5 4 v5 z" />
    <rect className={css.glyph} x="73" y="193" width="9" height="9" rx="2" />
    <circle className={css.hi} cx="100" cy="198" r="7" />
    <path className={css.hiGlyph} d="M96.5 195 h7 M96.5 198 h7 M96.5 201 h7" />
    <Tap x={100} y={198} />
  </Phone>,

  "samsung-plus": () => <Phone label="Samsung Internet: ketuk ikon tambah di bilah alamat">
    <rect className={css.card} x="12" y="22" width="96" height="16" rx="8" />
    <T x={19} y={32.5} size={7}>werkudara.group</T>
    <circle className={css.hi} cx="99" cy="30" r="6.5" />
    <path className={css.hiGlyph} d="M99 26.5 v7 M95.5 30 h7" />
    <Tap x={99} y={30} />
    <Page top={48} bottom={205} />
  </Phone>,

  "samsung-add": () => <Phone label="Samsung Internet: pilih Home screen (layar utama)">
    <Page top={26} bottom={90} />
    <Dim />
    <rect className={css.card} x="12" y="96" width="96" height="110" rx="10" />
    {[0, 1, 2, 3].map(col => <rect key={col} className={css.bar} x={20 + col * 22} y="104" width="14" height="14" rx="4" />)}
    {[0, 1, 2, 3].map(col => <rect key={col} className={css.bar} x={20 + col * 22} y="126" width="14" height="14" rx="4" />)}
    <rect className={css.bar} x="20" y="152" width="40" height="4" rx="2" />
    <rect className={css.card} x="40" y="162" width="66" height="42" rx="7" />
    <Row x={40} y={164} w={66} />
    <Row x={40} y={176} w={66} />
    <Row x={40} y={188} w={66} label="Home screen" hi />
    <Tap x={92} y={195.5} />
  </Phone>,

  "desktop-install": () => <Desktop label="Chrome atau Edge di laptop: klik ikon Instal di kanan bilah alamat">
    <rect className={css.card} x="10" y="22" width="200" height="14" rx="7" />
    <T x={20} y={31.5} size={7}>journey.werkudara.group/wam</T>
    <circle className={css.hi} cx="196" cy="29" r="6.5" />
    <path className={css.hiGlyph} d="M191.5 25.5 h9 v6 h-9 z M196 26.5 v3.5 M194.5 28.5 l1.5 1.5 l1.5 -1.5" />
    <Tap x={196} y={29} />
    <rect className={css.accent} x="14" y="48" width="192" height="30" rx="6" />
    <rect className={css.bar} x="14" y="86" width="150" height="5" rx="2.5" />
    <rect className={css.bar} x="14" y="97" width="120" height="5" rx="2.5" />
    <rect className={css.bar} x="14" y="108" width="170" height="5" rx="2.5" />
  </Desktop>,

  "desktop-dialog": () => <Desktop label="Jendela pemasangan di laptop: klik Instal">
    <rect className={css.card} x="10" y="22" width="200" height="14" rx="7" />
    <T x={20} y={31.5} size={7}>journey.werkudara.group/wam</T>
    <rect className={css.bar} x="14" y="50" width="100" height="5" rx="2.5" />
    <rect className={css.bar} x="14" y="61" width="80" height="5" rx="2.5" />
    <rect className={css.card} x="112" y="40" width="96" height="62" rx="8" />
    <rect className={css.bar} x="120" y="49" width="44" height="4" rx="2" />
    <Icon x={120} y={60} s={16} />
    <T x={142} y={71} size={7}>WAM</T>
    <rect className={css.hi} x="154" y="84" width="46" height="13" rx="6.5" />
    <T x={177} y={93} size={7} tone="hi" anchor="middle">Instal</T>
    <rect className={css.bar} x="122" y="88" width="20" height="4" rx="2" />
    <Tap x={177} y={90.5} />
  </Desktop>,

  "home-icon": () => <Phone label="Layar utama HP: buka WAM dari ikonnya">
    {[0, 1, 2, 3, 4].flatMap(row => [0, 1, 2, 3].map(col => {
      const x = 16 + col * 24;
      const y = 28 + row * 30;
      if (row === 2 && col === 1) return <g key={`${row}-${col}`}>
        <Icon x={x} y={y} s={18} />
        <rect className={css.ring} x={x - 3} y={y - 3} width="24" height="24" rx="7" />
        <T x={x + 9} y={y + 27} size={7} tone="hi" anchor="middle">WAM</T>
      </g>;
      return <g key={`${row}-${col}`}>
        <rect className={css.tile} x={x} y={y} width="18" height="18" rx="5" />
        <rect className={css.bar} x={x + 3} y={y + 22} width="12" height="2.5" rx="1.25" />
      </g>;
    }))}
    <Tap x={49} y={97} />
    <rect className={css.card} x="14" y="182" width="92" height="22" rx="10" />
  </Phone>,

  "wam-notif": () => <Phone label="Di WAM: Pengaturan, Notifikasi, lalu nyalakan Notifikasi di HP">
    <Page top={26} bottom={80} />
    <Dim />
    <rect className={css.card} x="7" y="86" width="106" height="127" rx="13" />
    <T x={15} y={106} size={9}>Notifikasi</T>
    <rect className={css.card} x="12" y="116" width="96" height="26" rx="8" />
    <rect className={css.accent} x="17" y="121" width="16" height="16" rx="5" />
    <path className={css.glyph} d="M21.5 132 h7 M22.5 132 v-4 a2.5 2.5 0 0 1 5 0 v4 M24.2 134.3 h1.6" />
    <T x={37} y={132} size={6.5}>Notifikasi HP</T>
    <rect className={css.ring} x="83" y="122.5" width="23" height="15" rx="7.5" />
    <Switch x={86} y={125} />
    <Tap x={98} y={130} />
    <rect className={css.bar} x="14" y="152" width="70" height="3.5" rx="1.75" />
    <rect className={css.card} x="12" y="162" width="96" height="40" rx="8" />
  </Phone>,

  "allow-prompt": () => <Phone label="Pertanyaan izin dari HP: ketuk Izinkan">
    <Page top={26} bottom={205} />
    <Dim />
    <rect className={css.card} x="14" y="74" width="92" height="84" rx="12" />
    <Icon x={53} y={82} s={14} />
    <T x={60} y={108} size={7} anchor="middle">Izinkan WAM</T>
    <T x={60} y={117} size={7} anchor="middle">mengirim notifikasi?</T>
    <rect className={css.hi} x="20" y="124" width="80" height="13" rx="6.5" />
    <T x={60} y={133} size={7} tone="hi" anchor="middle">Izinkan</T>
    <T x={60} y={150} size={7} tone="muted" anchor="middle">Jangan izinkan</T>
    <Tap x={78} y={130.5} />
  </Phone>,

  "ios-settings-notif": () => <Phone label="Pengaturan iPhone: Pemberitahuan, WAM, nyalakan Izinkan Pemberitahuan">
    <path className={css.glyph} d="M17 26 l-3 3 l3 3" />
    <T x={20} y={31.5} size={7} tone="muted">Pemberitahuan</T>
    <Icon x={14} y={40} s={16} />
    <T x={36} y={51} size={9}>WAM</T>
    <rect className={css.card} x="12" y="64" width="96" height="22" rx="8" />
    <T x={17} y={78} size={5.3} tone="hi">Izinkan Pemberitahuan</T>
    <rect className={css.ring} x="84" y="67.5" width="23" height="15" rx="7.5" />
    <Switch x={87} y={70} />
    <Tap x={99} y={75} />
    <rect className={css.card} x="12" y="94" width="96" height="50" rx="8" />
    <rect className={css.bar} x="18" y="102" width="56" height="3.5" rx="1.75" />
    <rect className={css.bar} x="18" y="118" width="64" height="3.5" rx="1.75" />
    <rect className={css.bar} x="18" y="134" width="44" height="3.5" rx="1.75" />
    <rect className={css.card} x="12" y="152" width="96" height="34" rx="8" />
  </Phone>,

  "android-settings-notif": () => <Phone label="Setelan Android: Notifikasi aplikasi, WAM, aktifkan">
    <path className={css.glyph} d="M17 26 l-3 3 l3 3" />
    <T x={22} y={31.5} size={7} tone="muted">Notifikasi aplikasi</T>
    <Icon x={48} y={40} s={24} />
    <T x={60} y={76} size={9} anchor="middle">WAM</T>
    <rect className={css.card} x="12" y="86" width="96" height="22" rx="8" />
    <T x={18} y={100} size={7} tone="hi">Notifikasi</T>
    <rect className={css.ring} x="84" y="89.5" width="23" height="15" rx="7.5" />
    <Switch x={87} y={92} />
    <Tap x={99} y={97} />
    <rect className={css.card} x="12" y="116" width="96" height="70" rx="8" />
    <rect className={css.bar} x="18" y="125" width="48" height="3.5" rx="1.75" />
    <rect className={css.bar} x="18" y="142" width="60" height="3.5" rx="1.75" />
    <rect className={css.bar} x="18" y="159" width="40" height="3.5" rx="1.75" />
    <rect className={css.bar} x="18" y="176" width="54" height="3.5" rx="1.75" />
  </Phone>,

  "desktop-site-notif": () => <Desktop label="Di laptop: klik Lihat informasi situs di kiri alamat, lalu Notifikasi diubah ke Izinkan">
    <rect className={css.card} x="10" y="22" width="200" height="14" rx="7" />
    <path className={css.glyph} d="M17 26.5 h6 M17 31.5 h6 M20 25 v3 M21 30 v3" />
    <T x={30} y={31.5} size={7}>journey.werkudara.group/wam</T>
    <rect className={css.card} x="12" y="40" width="110" height="60" rx="8" />
    <rect className={css.bar} x="20" y="48" width="60" height="4" rx="2" />
    <T x={20} y={70} size={7}>Notifikasi</T>
    <rect className={css.hi} x="86" y="61" width="30" height="13" rx="6.5" />
    <T x={101} y={70} size={7} tone="hi" anchor="middle">Izinkan</T>
    <rect className={css.bar} x="20" y="84" width="70" height="4" rx="2" />
    <Tap x={101} y={67.5} />
    <rect className={css.bar} x="130" y="50" width="76" height="5" rx="2.5" />
    <rect className={css.bar} x="130" y="61" width="60" height="5" rx="2.5" />
  </Desktop>,
};

/** One step's picture. */
export function InstallArt({ kind }: { kind: ArtKind }) {
  return <>{drawings[kind]()}</>;
}
