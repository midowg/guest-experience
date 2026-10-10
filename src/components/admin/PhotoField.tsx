"use client";

import { useId, useRef, useState } from "react";
import { Button, Field, Notice } from "@/components/ui";
import type { ImageSource } from "@/lib/types";
import { AdminApiError, errorMessage } from "./api";
import { srcsetAttribute } from "./editor-model";
import styles from "./admin.module.css";

export type PhotoValue = { url: string; srcset: ImageSource[] };

/** Narrow an unknown upload response into the generated sizes we trust, dropping anything malformed. */
function readSrcset(value: unknown): ImageSource[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ImageSource =>
    !!item && typeof item === "object"
    && typeof (item as ImageSource).url === "string" && (item as ImageSource).url.startsWith("https://")
    && Number.isFinite((item as ImageSource).width) && (item as ImageSource).width > 0);
}

/**
 * Two ways to supply the same thing: upload a file, or paste an approved HTTPS link.
 * Either way the value is a URL plus the generated sizes; an outside link simply has none.
 */
export function PhotoField({ name, label, value, srcset, onChange, error, hint }: {
  name: string; label: string; value: string; srcset: ImageSource[];
  onChange: (value: PhotoValue) => void; error?: string; hint?: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const statusId = useId();
  const [mode, setMode] = useState<"upload" | "url">(value ? "url" : "upload");
  const [pending, setPending] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploaded, setUploaded] = useState("");
  const [notOptimised, setNotOptimised] = useState(false);

  async function upload(file: File) {
    setPending(true); setUploadError(""); setUploaded(""); setNotOptimised(false);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/admin/photos", { method: "POST", body, credentials: "same-origin", cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (!result || typeof result.ok !== "boolean") throw new AdminApiError("Server belum dapat memastikan unggahan. Foto belum tersimpan.");
      if (!response.ok || !result.ok) throw new AdminApiError(result.message || "Foto gagal diunggah.");
      const url = typeof result.data?.url === "string" ? result.data.url : "";
      if (!url) throw new AdminApiError("Server tidak mengembalikan tautan foto. Foto belum tersimpan.");
      const sizes = readSrcset(result.data?.srcset);
      onChange({ url, srcset: sizes });
      setUploaded(file.name);
      // An empty srcset after a real upload means the resize step failed: the original was stored as-is.
      setNotOptimised(sizes.length === 0);
    } catch (err) {
      setUploadError(errorMessage(err));
    } finally {
      setPending(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  /** A pasted link replaces the photo, so previously generated sizes no longer describe it. */
  function setUrl(url: string) {
    setNotOptimised(false);
    onChange({ url, srcset: [] });
  }

  return <div className={styles.photoField}>
    <div className={styles.photoModes} role="group" aria-label={`Cara menambahkan ${label.toLowerCase()}`}>
      <Button type="button" variant={mode === "upload" ? "primary" : "secondary"} aria-pressed={mode === "upload"} onClick={() => setMode("upload")}>Unggah berkas</Button>
      <Button type="button" variant={mode === "url" ? "primary" : "secondary"} aria-pressed={mode === "url"} onClick={() => setMode("url")}>Gunakan tautan</Button>
    </div>

    {/* Distinct keys: without them React reuses one DOM input across both modes, so the
        uncontrolled file field becomes the controlled URL field and warns about it. */}
    {mode === "upload"
      ? <Field key="upload" name={`${name}-file`} label={label} hint="JPG, PNG, WebP, atau AVIF. Maksimal 8 MB. Unggah hanya foto yang boleh ditampilkan publik.">
        <input
          ref={fileInput}
          id={`${name}-file`}
          className="input"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          disabled={pending}
          aria-describedby={`${name}-file-hint ${statusId}`}
          onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }}
        />
      </Field>
      : <Field key="url" name={name} label={label} error={error} hint={hint ?? "Tempel tautan HTTPS lengkap, diawali https://"}>
        <input id={name} className="input" type="url" value={value ?? ""} maxLength={8000} aria-invalid={!!error} aria-describedby={`${name}-hint${error ? ` ${name}-error` : ""}`} onChange={event => setUrl(event.target.value)} />
      </Field>}

    <p id={statusId} role="status" className={styles.photoStatus}>{pending ? "Mengunggah foto…" : uploaded ? `Terunggah: ${uploaded}` : ""}</p>
    {uploadError && <Notice tone="error">{uploadError}</Notice>}
    {notOptimised && <Notice tone="error" role="alert">Foto tersimpan, tetapi server tidak membuat versi hemat data — foto belum dioptimalkan dan akan dikirim pada ukuran aslinya. Pertimbangkan mengecilkan foto sendiri lalu unggah ulang.</Notice>}
    {mode === "upload" && error && <p className="field-error">{error}</p>}

    {value && <div className={styles.photoPreview}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={value} srcSet={srcsetAttribute(srcset)} sizes="10rem" alt="" />
      <div>
        <p className="muted">{value}</p>
        <p className="muted">{srcset.length ? `${srcset.length} ukuran hemat data tersedia (${srcset.map(source => `${source.width}px`).join(", ")}).` : "Tanpa ukuran hemat data; foto dikirim pada ukuran aslinya."}</p>
        <Button type="button" variant="quiet" onClick={() => { onChange({ url: "", srcset: [] }); setUploaded(""); setNotOptimised(false); }}>Kosongkan foto</Button>
      </div>
    </div>}
  </div>;
}
