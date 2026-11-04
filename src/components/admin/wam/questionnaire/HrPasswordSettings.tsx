"use client";

import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { AdminApiError, adminRequest, errorMessage } from "@/components/admin/shared/api";
import { HR_UNLOCK_MINUTES, hrPasswordProblem } from "@/lib/pra-wam/hr-password";
import { praWamHrApi } from "@/lib/routes";
import { HrPasswordInput } from "./HrPasswordInput";
import hr from "./hr.module.css";

type Message = { tone: "success" | "error" | "warning"; text: string } | null;
type Errors = Partial<Record<"current" | "password" | "repeat", string>>;

/** The server's field errors, first message per field. */
const fieldErrors = (problem: unknown): Errors => {
  if (!(problem instanceof AdminApiError) || !problem.fieldErrors) return {};
  const pick = (key: string) => problem.fieldErrors?.[key]?.[0];
  return { current: pick("current"), password: pick("password") };
};

/**
 * Pengaturan → Password HR. With none yet, any admin sets the first one (typed twice, with a
 * strength hint). Once set, changing it needs the current one. A forgotten one is cleared by a
 * super admin (the server checks the role), after which a new one is set here. The password is
 * never shown again, and fields are emptied after each attempt.
 */
export function HrPasswordSettings({ hasPassword }: { hasPassword: boolean }) {
  const [has, setHas] = useState(hasPassword);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [confirm, confirmDialog] = useConfirm();

  const clear = () => { setCurrent(""); setPassword(""); setRepeat(""); };
  const edit = (set: (value: string) => void, key: keyof Errors) => (value: string) => { set(value); setErrors(old => ({ ...old, [key]: undefined })); setMessage(null); };

  function check(): Errors {
    const found: Errors = {};
    if (has && !current) found.current = "Isi password HR yang sekarang.";
    const problem = hrPasswordProblem(password);
    if (problem) found.password = problem;
    else if (has && password === current) found.password = "Password baru harus berbeda dari yang sekarang.";
    if (!found.password && repeat !== password) found.repeat = "Ulangi password yang sama persis.";
    return found;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const found = check();
    setErrors(found); setMessage(null);
    if (Object.values(found).some(Boolean)) return;
    if (!(await confirm(has ? {
      title: "Ganti password HR?",
      body: <>Semua perangkat yang sedang membuka Data HR langsung terkunci. Beri tahu password baru hanya kepada orang yang memang boleh membuka data HR.</>,
      confirmLabel: "Ganti password",
    } : {
      title: "Simpan password HR?",
      body: <>Password ini membuka jawaban paling pribadi peserta. Simpan di pengelola password; setelah ini password tidak bisa dilihat lagi, dan kalau lupa hanya super admin yang bisa mengatur ulang.</>,
      confirmLabel: "Simpan password",
    }))) return;
    setBusy("save");
    try {
      const result = has
        ? await adminRequest<null>(praWamHrApi.change, { method: "POST", body: JSON.stringify({ current, password }) })
        : await adminRequest<null>(praWamHrApi.set, { method: "POST", body: JSON.stringify({ password }) });
      clear(); setErrors({}); setHas(true);
      setMessage({ tone: "success", text: result.message });
    } catch (problem) {
      setErrors(fieldErrors(problem));
      setCurrent("");
      // Someone else set it meanwhile: show the change form instead.
      if (problem instanceof AdminApiError && problem.status === 409 && !has) setHas(true);
      setMessage({ tone: "error", text: errorMessage(problem) });
    } finally { setBusy(null); }
  }

  async function reset() {
    if (busy) return;
    if (!(await confirm({
      title: "Atur ulang password HR?",
      body: <>Password HR dihapus dan semua perangkat yang sedang membuka Data HR langsung terkunci. Data HR tidak bisa dibuka sampai password baru diatur. Tindakan ini dicatat di log akses.</>,
      confirmLabel: "Atur ulang",
      danger: true,
    }))) return;
    setBusy("reset"); setMessage(null);
    try {
      const result = await adminRequest<null>(praWamHrApi.reset, { method: "POST" });
      clear(); setErrors({}); setHas(false);
      setMessage({ tone: "success", text: result.message });
    } catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); }
    finally { setBusy(null); }
  }

  const locked = busy !== null;
  return <section className={hr.settings} aria-labelledby="hr-password-title">
    {confirmDialog}
    <div className={hr.settingsHead}>
      <span className={hr.settingsIcon} aria-hidden="true"><KeyRound size={20} /></span>
      <h2 id="hr-password-title">Password HR</h2>
      <span className={`${hr.pill} ${has ? hr.pillOn : ""}`}>{has ? "Sudah diatur" : "Belum diatur"}</span>
    </div>
    <p className={hr.lead}>
      Password terpisah dari password admin, untuk membuka jawaban level HR dan Rahasia (kesehatan, data menginap, kontak) di Data HR.
      Sekali dibuka, Data HR terbuka {HR_UNLOCK_MINUTES} menit di perangkat itu saja. Setiap buka dan gagal buka dicatat.
    </p>

    <form className={hr.form} noValidate onSubmit={save} aria-busy={busy === "save"}>
      {has && <HrPasswordInput id="hr-current" label="Password HR sekarang" value={current} onChange={edit(setCurrent, "current")}
        autoComplete="current-password" disabled={locked} error={errors.current} />}
      <HrPasswordInput id="hr-new" label={has ? "Password HR baru" : "Password HR"} value={password} onChange={edit(setPassword, "password")}
        autoComplete="new-password" disabled={locked} error={errors.password} strength
        hint="Minimal 10 karakter. Beberapa kata acak lebih mudah diingat dan sulit ditebak." />
      <HrPasswordInput id="hr-repeat" label="Ulangi password" value={repeat} onChange={edit(setRepeat, "repeat")}
        autoComplete="new-password" disabled={locked} error={errors.repeat} />
      <div className={hr.actions}>
        <Button type="submit" disabled={locked}>{busy === "save" ? "Menyimpan…" : has ? "Ganti password HR" : "Simpan password HR"}</Button>
      </div>
    </form>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}

    {has && <details className={hr.forgot}>
      <summary>Lupa password HR?</summary>
      <p>Hanya super admin yang bisa mengatur ulang. Setelah diatur ulang, password baru diatur dari halaman ini, dan Data HR terkunci sampai saat itu.</p>
      <Button type="button" variant="danger" disabled={locked} onClick={() => void reset()}>{busy === "reset" ? "Mengatur ulang…" : "Atur ulang password HR (super admin)"}</Button>
    </details>}
  </section>;
}
