import { birthdayDate, youtubeThumb, type TvItemKind, type TvWelcomeDesign } from "@/lib/pra-wam/tv";
import { TV_MARK, TV_WELCOME_ART } from "@/lib/routes";

/*
 * What a kind of playlist row looks like on a TV, at a glance: a small drawing of the slide
 * (16:9), not a live picture of it. The shapes follow the board (src/components/tv): the head with
 * the date and the clock, then the calendar, the list, the cards or the words in the middle. A
 * typed row shows its own words. Decorative: the row's name is always written beside it.
 */

const ink = { bg: "#0b1430", panel: "#16224a", line: "#263565", text: "#ffffff", muted: "#8fa0c8", accent: "#f2c96b" } as const;
const tones = ["#f0a43a", "#5aa9ff", "#53d28c", "#e879a6"] as const;
/** Words that fit the drawing: cut with an ellipsis, never shrunk. */
const short = (text: string, most: number) => { const clean = text.trim().replace(/\s+/g, " "); return clean.length > most ? `${clean.slice(0, most - 1).trimEnd()}…` : clean; };

/** The head every calendar and list slide has: a kicker and a title on the left, the clock on the right. */
function Head({ wide = 44 }: { wide?: number }) {
  return <>
    <rect x="8" y="8" width="26" height="3" rx="1.5" fill={ink.accent} />
    <rect x="8" y="14" width={wide} height="5" rx="2.5" fill={ink.text} />
    <rect x="130" y="9" width="22" height="9" rx="2" fill={ink.text} opacity=".9" />
  </>;
}

function Shapes({ kind, title, body, design, call, date, photo }: { kind: TvItemKind; title: string; body: string; design: TvWelcomeDesign; call: string; date: string; photo: string }) {
  if (kind === "kalender_hari") return <>
    <Head />
    {[0, 1, 2].map(row => <g key={row}>
      <rect x="8" y={30 + row * 18} width="22" height="3" rx="1.5" fill={ink.muted} />
      <rect x="36" y={26 + row * 18} width="116" height="13" rx="3" fill={ink.panel} />
    </g>)}
    <rect x="58" y="27.5" width="26" height="10" rx="2.5" fill={tones[0]} />
    <rect x="98" y="27.5" width="20" height="10" rx="2.5" fill={tones[0]} />
    <rect x="46" y="45.5" width="44" height="10" rx="2.5" fill={tones[1]} />
    <rect x="104" y="63.5" width="22" height="10" rx="2.5" fill={tones[2]} />
    <rect x="94" y="24" width="1" height="54" fill={ink.accent} />
  </>;
  if (kind === "kalender_minggu") return <>
    <Head wide={56} />
    {[0, 1, 2, 3, 4].map(day => <g key={day}>
      <rect x={8 + day * 29.5} y="26" width="26" height="54" rx="3" fill={ink.panel} />
      <rect x={11 + day * 29.5} y="29" width="12" height="2.5" rx="1.25" fill={ink.muted} />
      {Array.from({ length: [2, 4, 3, 1, 3][day] }, (_, index) => <rect key={index} x={11 + day * 29.5} y={35 + index * 10} width="20" height="7" rx="2" fill={tones[(day + index) % tones.length]} />)}
    </g>)}
  </>;
  if (kind === "timeline") return <>
    <Head wide={50} />
    {[0, 1, 2, 3].map(row => <g key={row}>
      <rect x="8" y={26 + row * 14} width="144" height="11" rx="3" fill={ink.panel} />
      <circle cx="15" cy={31.5 + row * 14} r="2.5" fill={tones[row % tones.length]} />
      <rect x="22" y={30 + row * 14} width={[62, 48, 70, 54][row]} height="3" rx="1.5" fill={ink.text} />
      <rect x="124" y={30 + row * 14} width="22" height="3" rx="1.5" fill={ink.muted} />
    </g>)}
  </>;
  if (kind === "pengumuman") return <>
    <Head wide={38} />
    {[0, 1].map(card => <g key={card}>
      <rect x="8" y={26 + card * 28} width="144" height="24" rx="4" fill={ink.panel} />
      <rect x="14" y={31 + card * 28} width={[70, 54][card]} height="4" rx="2" fill={ink.text} />
      <rect x="14" y={38 + card * 28} width="124" height="2.5" rx="1.25" fill={ink.muted} />
      <rect x="14" y={43 + card * 28} width={[96, 110][card]} height="2.5" rx="1.25" fill={ink.muted} />
    </g>)}
  </>;
  // The Werkudara sign: its own picture, with the name where the TV writes it.
  if ((kind === "sambutan" || kind === "tamu") && design === "werkudara") return <>
    <image href={TV_WELCOME_ART} width="160" height="90" preserveAspectRatio="xMidYMid slice" />
    <text x="80" y={body && kind === "tamu" ? 54 : 58} textAnchor="middle" fontSize={title.length > 22 ? 7 : 9} fontWeight="600" fill={ink.text}>{title ? short(title, 30) : "Nama tamu"}</text>
    {kind === "tamu" && body ? <text x="80" y="63" textAnchor="middle" fontSize="4.5" fill="#cfe6fb">{short(body, 48)}</text>
      : kind === "sambutan" ? <><rect x="56" y="63" width="20" height="2.4" rx="1.2" fill="#8fd0f5" /><rect x="82" y="63" width="24" height="2.4" rx="1.2" fill="#8fd0f5" /></> : null}
  </>;
  if (kind === "sambutan" || kind === "tamu") return <>
    {kind === "sambutan" && design === "foto" && <>
      {/* A visit's cover photo, darkened, behind the words. */}
      <rect width="160" height="90" fill="#27405e" />
      <path d="M0 90 L46 46 L74 70 L104 38 L160 90 Z" fill="#1c3049" />
      <circle cx="128" cy="22" r="9" fill="#3a5a80" />
      <rect width="160" height="90" fill="#050a18" opacity=".45" />
    </>}
    <text x="80" y="32" textAnchor="middle" fontSize="6.5" fontWeight="700" letterSpacing=".6" fill={ink.accent}>SELAMAT DATANG</text>
    <text x="80" y="50" textAnchor="middle" fontSize={title ? 12 : 13} fontWeight="700" fill={ink.text}>{title ? short(title, 20) : "Nama tamu"}</text>
    {kind === "sambutan"
      ? <><rect x="46" y="60" width="28" height="3.5" rx="1.75" fill={ink.text} opacity=".85" /><rect x="82" y="60" width="34" height="3.5" rx="1.75" fill={ink.text} opacity=".85" /></>
      : body ? <text x="80" y="63" textAnchor="middle" fontSize="6" fill={ink.muted}>{short(body, 40)}</text>
      : <rect x="50" y="59" width="60" height="3" rx="1.5" fill={ink.muted} />}
  </>;
  if (kind === "teks") return <>
    <text x="80" y="40" textAnchor="middle" fontSize="11" fontWeight="700" fill={ink.text}>{short(title || "Judul teks", 22)}</text>
    {body ? <text x="80" y="55" textAnchor="middle" fontSize="6.5" fill={ink.muted}>{short(body, 40)}</text>
      : <><rect x="40" y="50" width="80" height="3" rx="1.5" fill={ink.muted} /><rect x="52" y="57" width="56" height="3" rx="1.5" fill={ink.muted} /></>}
  </>;
  // A birthday greeting: the card on its side, the photo in its white frame on the left.
  if (kind === "ultah") {
    const on = birthdayDate(date);
    return <>
      <rect width="160" height="90" fill="#f3efe4" />
      <rect x="14" y="10" width="48" height="70" fill="#fff" stroke="#e2dccd" />
      {photo ? <image href={photo} x="17" y="13" width="42" height="56" preserveAspectRatio="xMidYMin slice" /> : <rect x="17" y="13" width="42" height="56" fill="#e7e1d2" />}
      <image href={TV_MARK} x="76" y="10" width="9" height="10" />
      <text x="76" y="37" fontSize={title.length > 16 ? 8 : 10} fontWeight="700" fill="#16130f">{short(title || "Nama lengkap", 22)}</text>
      {on.day && <text x="148" y="37" textAnchor="end" fontSize="10" fontWeight="700" fill="#16130f">{on.day}</text>}
      {on.day && <text x="148" y="44" textAnchor="end" fontSize="5" fill="#16130f">{on.month}</text>}
      <text x="76" y="55" fontSize="6" fontStyle="italic" fontWeight="700" fill="#16130f">{short(`Happy Birthday, ${call || title || "…"}`, 30)}</text>
      <text x="76" y="63" fontSize="4.2" fontStyle="italic" fill="#4a443a">{short(body, 46)}</text>
    </>;
  }
  // A video: its own still from YouTube (`body` is the video's id), with the play mark over it.
  if (kind === "video") return <>
    {body && <image href={youtubeThumb(body)} width="160" height="90" preserveAspectRatio="xMidYMid slice" />}
    <rect width="160" height="90" fill="#050a18" opacity=".3" />
    <circle cx="80" cy="45" r="13" fill="#050a18" opacity=".7" />
    <path d="M76 38 L88 45 L76 52 Z" fill={ink.text} />
  </>;
  // A picture without its file at hand (the upload's pane): a frame with a landscape.
  return <>
    <rect x="34" y="18" width="92" height="54" rx="5" fill={ink.panel} stroke={ink.line} />
    <circle cx="56" cy="35" r="6" fill={ink.accent} />
    <path d="M38 68 L66 44 L84 58 L98 48 L122 68 Z" fill={tones[1]} />
  </>;
}

/** The drawing for a kind; `title` and `body` are a typed row's own words, shown in it. */
export function TvPreview({ kind, title = "", body = "", design = "werkudara", call = "", date = "", photo = "", className }: { kind: TvItemKind; title?: string; body?: string; design?: TvWelcomeDesign; call?: string; date?: string; photo?: string; className?: string }) {
  return <svg className={className} viewBox="0 0 160 90" role="img" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice">
    <rect width="160" height="90" fill={ink.bg} />
    <Shapes kind={kind} title={title} body={body} design={design} call={call} date={date} photo={photo} />
  </svg>;
}
