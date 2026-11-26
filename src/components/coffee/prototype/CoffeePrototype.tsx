"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Bell, Check, ChevronLeft, CircleAlert, ClipboardList, Coffee, CupSoda, Download, EllipsisVertical, Eye, EyeOff,
  Flame, House, Info, MapPin, Share, Snowflake, SquarePlus, X,
} from "lucide-react";
import {
  DRINKS, GROUP_LABEL, ICE_LEVELS, MONTHLY_QUOTA, SUGAR_LEVELS, optionsLabel,
  type Drink, type DrinkGroup, type Ice, type QuotaGroup, type Sugar, type Temperature,
} from "@/lib/coffee/menu";
import { BUILDING, PLAN_SPOTS } from "@/lib/pra-wam/floor-plan";
import styles from "./coffee-prototype.module.css";
import { nowIso, shortName, useCoffeeStore, type Claim } from "./store";

/*
 * Werkudara Coffee, employee side, as a clickable prototype (25 Nov 2026). Employees sign in with
 * their Journey employee account (the one WG People and Booking Kantor use). A claim goes to everyone
 * who holds the Werkudara Coffee access (HR and admins); whoever takes it buys it in JumpStart.
 * Nothing is saved or sent: that side is simulated from the scenario panel. Names are made up.
 */

type Person = { name: string; email: string; group: QuotaGroup; position: string; bu: string };
type Status = "menunggu" | "dibeli" | "ditolak" | "batal";
type Order = { id: string; drink: Drink; temperature: Temperature; sugar: Sugar; ice: Ice; status: Status; at: Date; claim: number; reason?: string; doneAt?: Date; doneBy?: string };
type Step = "welcome" | "login" | "install" | "notify";

const PEOPLE: Person[] = [
  { name: "Contoh Rina Putri", email: "rina@werkudara.com", group: "karyawan", position: "Communications Specialist", bu: "WNS" },
  { name: "Contoh Bagas Saputra", email: "bagas@werkudara.com", group: "ga", position: "General Affair", bu: "WNS" },
  { name: "Contoh Fajar Nugroho", email: "fajar@werkudara.com", group: "intern", position: "Design Intern", bu: "CoE" },
];
/** Who processed it, as the employee sees it: a person with the Werkudara Coffee access. */
const PROCESSOR = "Contoh Dewi Lestari (HR)";
const MONTH = "November";
const RESET_DAY = "Selasa, 1 Desember";
const firstName = (name: string) => name.replace(/^Contoh /, "").split(" ")[0];
const clock = (date: Date) => date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const photo = (drink: Drink) => `/dev/coffee/${drink.slug}.jpg`;
const STORE_STATUS: Record<Claim["status"], Status> = { diproses: "menunggu", selesai: "dibeli", ditolak: "ditolak", batal: "batal" };
/** A claim of the shared prototype data as this screen shows it. */
const toOrder = (claim: Claim): Order => ({
  id: claim.id, drink: DRINKS.find(drink => drink.slug === claim.slug) ?? DRINKS[0], temperature: claim.temperature, sugar: claim.sugar, ice: claim.ice,
  status: STORE_STATUS[claim.status], at: new Date(claim.at), claim: claim.claimNo, reason: claim.reason,
  doneAt: claim.doneAt ? new Date(claim.doneAt) : undefined, doneBy: claim.doneBy ? shortName(claim.doneBy) : undefined,
});

export function CoffeePrototype() {
  const [stage, setStage] = useState<"activation" | "app">("activation");
  const [step, setStep] = useState<Step>("welcome");
  const [person, setPerson] = useState<Person>(PEOPLE[0]);
  const [usedBefore, setUsedBefore] = useState(0);
  const { state, update } = useCoffeeStore();
  const mine = state.claims.filter(claim => claim.person === person.name);
  const orders = mine.map(toOrder);
  const [tab, setTab] = useState<"menu" | "pesanan">("menu");
  const [sheet, setSheet] = useState<Drink | null>(null);
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);
  const [opened] = useState(() => Date.now());
  const [seen, setSeen] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);

  const quota = MONTHLY_QUOTA[person.group];
  const used = usedBefore + orders.filter(order => order.status === "menunggu" || order.status === "dibeli").length;
  const left = Math.max(0, quota - used);
  const active = orders.find(order => order.status === "menunggu");

  // A claim processed since the app opened (here or by a pengelola in another tab) shows as a push notification.
  const fresh = mine.filter(claim => claim.doneAt && (claim.status === "selesai" || claim.status === "ditolak") && Date.parse(claim.doneAt) > opened)
    .sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""))[0];
  const freshKey = fresh ? `${fresh.id}@${fresh.doneAt}` : null;
  const notice = toast ?? (fresh && freshKey !== seen ? (() => {
    const drink = DRINKS.find(item => item.slug === fresh.slug)?.name ?? "Minuman";
    const who = shortName(fresh.doneBy ?? PROCESSOR);
    return fresh.status === "selesai"
      ? { title: "Silakan ambil di mesin", body: `${drink} kamu sudah diproses ${who}. Ambil di mesin kopi pantry.` }
      : { title: "Pengajuan tidak bisa diproses", body: `${drink}: lihat catatan dari ${who}. Jatah tidak berkurang.` };
  })() : null);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => { setToast(null); setSeen(freshKey); }, 5000);
    return () => window.clearTimeout(timer);
  }, [notice === null, freshKey, toast]); // eslint-disable-line react-hooks/exhaustive-deps -- `notice` is rebuilt every render

  const setClaim = (id: string, patch: Partial<Claim>) =>
    update(data => ({ ...data, claims: data.claims.map(claim => claim.id === id ? { ...claim, ...patch } : claim) }));
  const submit = (order: { drink: Drink; temperature: Temperature; sugar: Sugar; ice: Ice }) => {
    update(data => ({
      ...data,
      seq: { ...data.seq, claim: data.seq.claim + 1 },
      claims: [{
        id: `K-${data.seq.claim}`, kind: "klaim", person: person.name, group: person.group, position: person.position, bu: person.bu,
        slug: order.drink.slug, temperature: order.temperature, sugar: order.sugar, ice: order.ice,
        claimNo: used + 1, at: nowIso(), status: "diproses",
      }, ...data.claims],
    }));
    setSheet(null);
    setTab("pesanan");
  };
  const settle = (status: "selesai" | "ditolak") => {
    setPanel(false);
    if (!active) return;
    setClaim(active.id, { status, doneBy: PROCESSOR, doneAt: nowIso(), reason: status === "ditolak" ? "Susu segar sedang habis. Coba Americano atau Kopi Hitam dulu, ya." : undefined });
  };
  const restart = (to: "activation" | "app", patch: Partial<{ person: Person; usedBefore: number }> = {}) => {
    setStage(to); setStep("welcome"); setTab("menu"); setSheet(null); setToast(null); setCancelId(null);
    if (patch.person) setPerson(patch.person);
    setUsedBefore(patch.usedBefore ?? 0);
    setPanel(false);
  };

  return (
    <div className={styles.stage}>
      <div className={styles.phone}>
        {stage === "activation"
          ? <Activation step={step} setStep={setStep} onSignIn={setPerson} onDone={() => setStage("app")} />
          : (
            <div className={styles.app}>
              <header className={styles.topbar}>
                <span className={styles.brand}><Coffee aria-hidden size={20} />Werkudara Coffee</span>
                <span className={styles.avatar} aria-label={person.name}>{firstName(person.name).slice(0, 1)}</span>
              </header>
              <main className={styles.scroll}>
                {tab === "menu"
                  ? <MenuScreen person={person} quota={quota} left={left} onPick={setSheet} />
                  : <OrdersScreen orders={orders} onCancel={setCancelId} onMenu={() => setTab("menu")} />}
              </main>
              <nav className={styles.tabbar} aria-label="Navigasi">
                <button type="button" aria-current={tab === "menu" ? "page" : undefined} onClick={() => setTab("menu")}><House aria-hidden size={22} />Menu</button>
                <button type="button" aria-current={tab === "pesanan" ? "page" : undefined} onClick={() => setTab("pesanan")}>
                  <span className={styles.tabIcon}><ClipboardList aria-hidden size={22} />{active && <span className={styles.badge} aria-label="1 pengajuan sedang diproses" />}</span>Pesanan saya
                </button>
              </nav>
              {sheet && <DrinkSheet drink={sheet} quota={quota} used={used} onClose={() => setSheet(null)} onSubmit={submit} />}
              {cancelId && (
                <div className={styles.scrim} onClick={() => setCancelId(null)}>
                  <div className={styles.dialog} role="alertdialog" aria-labelledby="batal-judul" onClick={event => event.stopPropagation()}>
                    <h2 id="batal-judul">Batalkan pengajuan?</h2>
                    <p>Pengajuan ini belum diproses. Jatah kamu dikembalikan.</p>
                    <div className={styles.row}>
                      <button type="button" className={styles.secondary} onClick={() => setCancelId(null)}>Tidak jadi</button>
                      <button type="button" className={styles.danger} onClick={() => { setClaim(cancelId, { status: "batal" }); setCancelId(null); }}>Batalkan</button>
                    </div>
                  </div>
                </div>
              )}
              {notice && (
                <button type="button" className={styles.toast} onClick={() => { setTab("pesanan"); setToast(null); setSeen(freshKey); }}>
                  <span className={styles.toastIcon}><Coffee aria-hidden size={18} /></span>
                  <span><strong>{notice.title}</strong><span>{notice.body}</span></span>
                </button>
              )}
            </div>
          )}
      </div>

      <button type="button" className={styles.panelToggle} onClick={() => setPanel(open => !open)} aria-expanded={panel}>Prototype · skenario</button>
      <aside className={styles.panel} data-open={panel || undefined} aria-label="Skenario prototype">
        <h2>Skenario</h2>
        <p>Data contoh hanya di browser ini, dipakai bersama <a href="/dev-preview/coffee/hr" target="_blank">halaman pengelola</a> dan <a href="/dev-preview/coffee/ga" target="_blank">tablet GA</a>. Buka di tab lain untuk mencoba alur lengkap.</p>
        <div className={styles.panelGroup}>
          <span>Mulai</span>
          <button type="button" onClick={() => restart("activation")}>Dari awal (masuk)</button>
          <button type="button" onClick={() => restart("app")}>Langsung ke menu</button>
        </div>
        <div className={styles.panelGroup}>
          <span>Masuk sebagai</span>
          {PEOPLE.map(item => (
            <button key={item.group} type="button" aria-pressed={person.group === item.group}
              onClick={() => restart("app", { person: item, usedBefore: 0 })}>{GROUP_LABEL[item.group]} · {MONTHLY_QUOTA[item.group]}×</button>
          ))}
          <button type="button" onClick={() => restart("app", { person, usedBefore: MONTHLY_QUOTA[person.group] })}>Jatah sudah habis</button>
        </div>
        <div className={styles.panelGroup}>
          <span>Tindakan pengelola {active ? `(${active.drink.name})` : "· ajukan minuman dulu"}</span>
          <button type="button" disabled={!active} onClick={() => settle("selesai")}>Proses (sudah dibeli)</button>
          <button type="button" disabled={!active} onClick={() => settle("ditolak")}>Tolak dengan catatan</button>
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ sign-in and setup */

function Activation({ step, setStep, onSignIn, onDone }: {
  step: Step; setStep: (step: Step) => void; onSignIn: (person: Person) => void; onDone: () => void;
}) {
  const progress = step === "install" ? 1 : 2;
  return (
    <div className={styles.activation}>
      {(step === "install" || step === "notify") && (
        <header className={styles.stepbar}>
          <button type="button" className={styles.iconButton} aria-label="Kembali" onClick={() => setStep(step === "notify" ? "install" : "login")}>
            <ChevronLeft aria-hidden size={24} />
          </button>
          <span>Atur sekali · {progress} dari 2</span>
          <span className={styles.progress} aria-hidden><span style={{ width: `${progress * 50}%` }} /></span>
        </header>
      )}

      {step === "welcome" && (
        <section className={styles.welcome}>
          <span className={styles.welcomeMark}><Coffee aria-hidden size={36} /></span>
          <h1>Werkudara Coffee</h1>
          <p>Klaim jatah kopi bulanan dari HP. Pengajuanmu diproses HR atau admin, kamu tinggal ambil di mesin pantry.</p>
          <ul className={styles.facts}>
            <li><Check aria-hidden size={18} />Masuk dengan akun karyawan Journey</li>
            <li><Check aria-hidden size={18} />Akun yang sama dengan WG People dan Booking Kantor</li>
          </ul>
          <button type="button" className={styles.primary} onClick={() => setStep("login")}>Masuk</button>
        </section>
      )}

      {step === "login" && <SignIn onBack={() => setStep("welcome")} onSignedIn={person => { onSignIn(person); setStep("install"); }} />}

      {step === "install" && <InstallStep onNext={() => setStep("notify")} />}

      {step === "notify" && (
        <section className={styles.stepBody}>
          <h1>Izinkan notifikasi</h1>
          <p className={styles.lead}>Supaya kamu tahu begitu pengajuan selesai diproses dan kopi siap diambil.</p>
          <div className={styles.notifPreview} aria-hidden>
            <span className={styles.toastIcon}><Coffee size={18} /></span>
            <span><strong>Werkudara Coffee</strong><span>Café Latte kamu sudah diproses. Ambil di mesin pantry.</span></span>
          </div>
          <div className={styles.footer}>
            <button type="button" className={styles.primary} onClick={onDone}><Bell aria-hidden size={20} />Izinkan notifikasi</button>
            <button type="button" className={styles.textButton} onClick={onDone}>Nanti saja</button>
          </div>
        </section>
      )}
    </div>
  );
}

/** Masuk, as WG People and Booking Kantor sign in: office email and the employee account's password. */
function SignIn({ onBack, onSignedIn }: { onBack: () => void; onSignedIn: (person: Person) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const send = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const found = PEOPLE.find(item => email.trim().toLowerCase().startsWith(item.email.split("@")[0])) ?? PEOPLE[0];
    window.setTimeout(() => onSignedIn(found), 500);
  };
  return (
    <section className={styles.stepBody}>
      <header className={styles.stepbar}>
        <button type="button" className={styles.iconButton} aria-label="Kembali" onClick={onBack}><ChevronLeft aria-hidden size={24} /></button>
      </header>
      <h1>Masuk</h1>
      <p className={styles.lead}>Pakai email kantor dan password akun karyawanmu.</p>
      <form className={styles.form} onSubmit={send}>
        <label className={styles.label} htmlFor="kopi-email">Email</label>
        <input id="kopi-email" className={styles.input} type="email" autoComplete="username" inputMode="email" placeholder="nama@werkudara.com" value={email} onChange={event => setEmail(event.target.value)} required />
        <label className={styles.label} htmlFor="kopi-password">Password</label>
        <span className={styles.secret}>
          <input id="kopi-password" className={styles.input} type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required />
          <button type="button" className={styles.iconButton} aria-pressed={show} aria-label={show ? "Sembunyikan password" : "Lihat password"} onClick={() => setShow(!show)}>{show ? <EyeOff aria-hidden size={20} /> : <Eye aria-hidden size={20} />}</button>
        </span>
        <button type="button" className={styles.linkButton} onClick={() => setForgot(!forgot)} aria-expanded={forgot}>Lupa password?</button>
        {forgot && <p className={styles.hint} role="status">Minta admin mengatur ulang password-mu ke password awal, lalu masuk dan buat password baru.</p>}
        <button type="submit" className={styles.primary} disabled={busy || !email || !password}>{busy ? "Memeriksa…" : "Masuk"}</button>
      </form>
      <p className={styles.hint}>Prototype: email dan password apa saja diterima. Coba bagas@ (GA) atau fajar@ (intern).</p>
    </section>
  );
}

function InstallStep({ onNext }: { onNext: () => void }) {
  // Only ever rendered after a tap (never on the server), so reading the user agent here is safe.
  const [ios, setIos] = useState(() => typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent));
  return (
    <section className={styles.stepBody}>
      <h1>Pasang di layar utama</h1>
      <p className={styles.lead}>Seterusnya cukup ketuk ikon ini, tanpa membuka tautan lagi.</p>
      <div className={styles.appIcon}><span><Coffee aria-hidden size={30} /></span>Werkudara Coffee</div>
      <div className={styles.segmented} role="tablist" aria-label="Jenis HP">
        <button type="button" role="tab" aria-selected={!ios} onClick={() => setIos(false)}>Android</button>
        <button type="button" role="tab" aria-selected={ios} onClick={() => setIos(true)}>iPhone</button>
      </div>
      <ol className={styles.howto}>
        {ios ? (
          <>
            <li><Share aria-hidden size={20} /><span>Ketuk <strong>Bagikan</strong> di bawah layar Safari</span></li>
            <li><SquarePlus aria-hidden size={20} /><span>Pilih <strong>Tambah ke Layar Utama</strong></span></li>
            <li><Check aria-hidden size={20} /><span>Ketuk <strong>Tambah</strong></span></li>
          </>
        ) : (
          <>
            <li><Download aria-hidden size={20} /><span>Ketuk <strong>Pasang sekarang</strong> di bawah</span></li>
            <li><EllipsisVertical aria-hidden size={20} /><span>Tidak muncul? Buka menu <strong>⋮</strong> Chrome</span></li>
            <li><SquarePlus aria-hidden size={20} /><span>Pilih <strong>Tambahkan ke layar utama</strong></span></li>
          </>
        )}
      </ol>
      <div className={styles.footer}>
        {!ios && <button type="button" className={styles.primary} onClick={onNext}><Download aria-hidden size={20} />Pasang sekarang</button>}
        {ios && <button type="button" className={styles.primary} onClick={onNext}>Sudah, lanjut</button>}
        <button type="button" className={styles.textButton} onClick={onNext}>Nanti saja</button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ menu */

function MenuScreen({ person, quota, left, onPick }: { person: Person; quota: number; left: number; onPick: (drink: Drink) => void }) {
  const [group, setGroup] = useState<DrinkGroup>("kopi");
  const drinks = DRINKS.filter(drink => drink.group === group);
  return (
    <>
      <section className={styles.hello}>
        <p className={styles.muted}>{GROUP_LABEL[person.group]} · {MONTH}</p>
        <h1>Halo, {firstName(person.name)}</h1>
        <div className={styles.quota}>
          <span className={styles.dots} aria-hidden>
            {Array.from({ length: quota }, (_, index) => <span key={index} data-on={index < left || undefined} />)}
          </span>
          <span><strong>Sisa {left} dari {quota}</strong> klaim bulan ini</span>
        </div>
      </section>

      {left === 0 && (
        <section className={styles.notice} data-tone="wait">
          <CircleAlert aria-hidden size={20} />
          <span><strong>Jatah bulan ini sudah habis</strong>Jatah kembali {RESET_DAY}. Menu tetap bisa dilihat.</span>
        </section>
      )}

      <div className={styles.segmented} role="tablist" aria-label="Jenis minuman">
        <button type="button" role="tab" aria-selected={group === "kopi"} onClick={() => setGroup("kopi")}><Coffee aria-hidden size={18} />Kopi</button>
        <button type="button" role="tab" aria-selected={group === "non-kopi"} onClick={() => setGroup("non-kopi")}><CupSoda aria-hidden size={18} />Non-kopi</button>
      </div>

      <ul className={styles.grid}>
        {drinks.map(drink => (
          <li key={drink.slug}>
            <button type="button" className={styles.card} onClick={() => onPick(drink)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- prototype stand-in photos */}
              <img src={photo(drink)} alt="" width={240} height={240} loading="lazy" />
              <strong>{drink.name}</strong>
              <span>{drink.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function DrinkSheet({ drink, quota, used, onClose, onSubmit }: {
  drink: Drink; quota: number; used: number; onClose: () => void;
  onSubmit: (order: { drink: Drink; temperature: Temperature; sugar: Sugar; ice: Ice }) => void;
}) {
  const [temperature, setTemperature] = useState<Temperature>(drink.temperatures[0]);
  const [sugar, setSugar] = useState<Sugar>("Normal");
  const [ice, setIce] = useState<Ice>("Normal");
  const closeRef = useRef<HTMLButtonElement>(null);
  const empty = used >= quota;
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.scrim} onClick={onClose}>
      <div className={styles.sheet} role="dialog" aria-modal aria-labelledby="minuman-judul" onClick={event => event.stopPropagation()}>
        <span className={styles.grabber} aria-hidden />
        <div className={styles.sheetHead}>
          {/* eslint-disable-next-line @next/next/no-img-element -- prototype stand-in photos */}
          <img src={photo(drink)} alt="" width={88} height={88} />
          <div><h2 id="minuman-judul">{drink.name}</h2><p>{drink.description}</p></div>
          <button ref={closeRef} type="button" className={styles.iconButton} aria-label="Tutup" onClick={onClose}><X aria-hidden size={22} /></button>
        </div>

        {drink.temperatures.length > 1 && (
          <fieldset className={styles.field}>
            <legend>Suhu</legend>
            <div className={styles.options} data-cols="2">
              <Option on={temperature === "panas"} onClick={() => setTemperature("panas")}><Flame aria-hidden size={18} />Panas</Option>
              <Option on={temperature === "es"} onClick={() => setTemperature("es")}><Snowflake aria-hidden size={18} />Es</Option>
            </div>
          </fieldset>
        )}
        <fieldset className={styles.field}>
          <legend>Gula</legend>
          <div className={styles.options} data-cols="3">
            {SUGAR_LEVELS.map(level => <Option key={level} on={sugar === level} onClick={() => setSugar(level)}>{level}</Option>)}
          </div>
        </fieldset>
        {temperature === "es" && (
          <fieldset className={styles.field}>
            <legend>Takaran es</legend>
            <div className={styles.options} data-cols="3">
              {ICE_LEVELS.map(level => <Option key={level} on={ice === level} onClick={() => setIce(level)}>{level}</Option>)}
            </div>
          </fieldset>
        )}

        <div className={styles.sheetFoot}>
          {!empty && <p className={styles.sendTo}><Info aria-hidden size={16} />Dikirim ke pengelola Werkudara Coffee: HR dan admin yang punya akses.</p>}
          <p className={styles.muted}>{empty ? `Jatah bulan ini habis. Kembali ${RESET_DAY}.` : `Ini klaim ke-${used + 1} dari ${quota} bulan ${MONTH}.`}</p>
          <button type="button" className={styles.primary} disabled={empty} onClick={() => onSubmit({ drink, temperature, sugar, ice })}>
            {empty ? "Jatah habis" : "Ajukan klaim"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Option({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={styles.option} aria-pressed={on} onClick={onClick}>{children}</button>;
}

/* ------------------------------------------------------------------ orders */

const STATUS: Record<Status, { label: string; tone: string }> = {
  menunggu: { label: "Diproses", tone: "wait" },
  dibeli: { label: "Siap diambil", tone: "ok" },
  ditolak: { label: "Ditolak", tone: "no" },
  batal: { label: "Dibatalkan", tone: "off" },
};

function OrdersScreen({ orders, onCancel, onMenu }: { orders: Order[]; onCancel: (id: string) => void; onMenu: () => void }) {
  const [current, ...rest] = orders;
  if (!current) return (
    <section className={styles.emptyState}>
      <ClipboardList aria-hidden size={32} />
      <h1>Belum ada pesanan</h1>
      <p>Pilih minuman di Menu, lalu ajukan klaim.</p>
      <button type="button" className={styles.secondary} onClick={onMenu}>Lihat menu</button>
    </section>
  );
  return (
    <>
      <CurrentOrder order={current} onCancel={onCancel} onMenu={onMenu} />
      {rest.length > 0 && (
        <section>
          <h2 className={styles.sectionTitle}>Sebelumnya</h2>
          <ul className={styles.history}>
            {rest.map(order => (
              <li key={order.id}>
                {/* eslint-disable-next-line @next/next/no-img-element -- prototype stand-in photos */}
                <img src={photo(order.drink)} alt="" width={48} height={48} />
                <span><strong>{order.drink.name}</strong><span>{clock(order.at)} · {optionsLabel(order.temperature, order.sugar, order.ice)}</span></span>
                <span className={styles.pill} data-tone={STATUS[order.status].tone}>{STATUS[order.status].label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function CurrentOrder({ order, onCancel, onMenu }: { order: Order; onCancel: (id: string) => void; onMenu: () => void }) {
  const steps = useMemo(() => [
    { label: "Diajukan", note: clock(order.at), done: true },
    { label: "Diproses", note: order.status === "menunggu" ? "Menunggu pengelola" : order.status === "dibeli" && order.doneAt ? `Selesai oleh ${order.doneBy ?? shortName(PROCESSOR)} · ${clock(order.doneAt)}` : "", done: order.status === "dibeli" },
    { label: "Ambil di mesin pantry", note: order.status === "dibeli" ? "Sekarang" : "", done: false },
  ], [order]);
  const tone = STATUS[order.status].tone;
  const title = { menunggu: "Pengajuan sedang diproses", dibeli: "Silakan ambil di mesin", ditolak: "Pengajuan tidak bisa diproses", batal: "Pengajuan dibatalkan" }[order.status];

  return (
    <section className={styles.current}>
      <span className={styles.pill} data-tone={tone}>{STATUS[order.status].label}</span>
      <h1>{title}</h1>

      <div className={styles.orderCard}>
        {/* eslint-disable-next-line @next/next/no-img-element -- prototype stand-in photos */}
        <img src={photo(order.drink)} alt="" width={64} height={64} />
        <span><strong>{order.drink.name}</strong><span>{optionsLabel(order.temperature, order.sugar, order.ice)}</span><span>#{order.id}{order.status === "menunggu" || order.status === "dibeli" ? ` · klaim ke-${order.claim}` : ""}</span></span>
      </div>

      {order.status === "ditolak" && (
        <div className={styles.reason}>
          <strong>Catatan dari {order.doneBy ?? shortName(PROCESSOR)}</strong>
          <p>{order.reason}</p>
          <span>Jatah kamu tidak berkurang.</span>
        </div>
      )}

      {(order.status === "menunggu" || order.status === "dibeli") && (
        <ol className={styles.timeline} data-ready={order.status === "dibeli" || undefined}>
          {steps.map((item, index) => {
            const now = order.status === "menunggu" ? index === 1 : index === 2;
            return (
              <li key={item.label} data-done={item.done || undefined} data-now={now || undefined}>
                <span className={styles.node} aria-hidden>{item.done ? <Check size={14} /> : null}</span>
                <span><strong>{item.label}</strong>{item.note && <span>{item.note}</span>}</span>
              </li>
            );
          })}
        </ol>
      )}

      {order.status === "dibeli" && (
        <div className={styles.location}>
          <PantryMap />
          <span><span className={styles.muted}>Lokasi mesin</span><strong>Pantry, lantai ini</strong>{order.temperature === "es" && <span>Es ditambahkan tim GA di pantry.</span>}</span>
        </div>
      )}

      {order.status === "menunggu" && (
        <div className={styles.infoBox}>
          <Info aria-hidden size={20} />
          <span><strong>Siapa yang memproses?</strong>Pengajuanmu masuk ke HR dan admin yang punya akses Werkudara Coffee. Siapa pun yang lebih dulu membuka akan membelikannya, lalu kamu diberi notifikasi.</span>
        </div>
      )}

      <div className={styles.actions}>
        {order.status === "menunggu" && <button type="button" className={styles.dangerText} onClick={() => onCancel(order.id)}>Batalkan pengajuan</button>}
        {order.status !== "menunggu" && <button type="button" className={order.status === "dibeli" ? styles.secondary : styles.primary} onClick={onMenu}>{order.status === "ditolak" ? "Pilih minuman lain" : "Kembali ke menu"}</button>}
      </div>
    </section>
  );
}

/** The office floor plan of Pra WAM, cropped to the building, with the pantry marked. */
function PantryMap() {
  const pantry = PLAN_SPOTS.pantry.rect;
  const cx = pantry.x + pantry.w / 2, cy = pantry.y + pantry.h / 2;
  return (
    <svg className={styles.map} viewBox={`${BUILDING.x} ${BUILDING.y} ${BUILDING.w} ${BUILDING.h}`} role="img" aria-label="Denah kantor, pantry ditandai">
      <rect {...rectProps(BUILDING)} className={styles.mapBuilding} />
      {Object.entries(PLAN_SPOTS).map(([key, spot]) => spot.shape
        ? <polygon key={key} points={spot.shape.map(point => point.join(",")).join(" ")} className={key === "pantry" ? styles.mapPantry : styles.mapRoom} />
        : <rect key={key} {...rectProps(spot.rect)} className={key === "pantry" ? styles.mapPantry : styles.mapRoom} />)}
      <g transform={`translate(${cx} ${cy})`} className={styles.mapPin}>
        <circle r="150" opacity=".2" />
        <MapPin x={-130} y={-250} width={260} height={260} strokeWidth={2.4} />
      </g>
    </svg>
  );
}
const rectProps = (rect: { x: number; y: number; w: number; h: number }) => ({ x: rect.x, y: rect.y, width: rect.w, height: rect.h });
