"use client";

import { useId, useRef, useState } from "react";
import { Button, Field, Notice } from "@/components/ui";
import type { ImageSource } from "@/lib/types";
import { AdminApiError, errorMessage } from "@/components/admin/shared/api";
import { srcsetAttribute } from "@/components/admin/editor/editor-model";
import styles from "@/components/admin/admin.module.css";

export type PhotoValue = { url: string; srcset: ImageSource[] };

/** Narrow an unknown upload response into the generated sizes we trust, dropping anything malformed. */
function readSrcset(value: unknown): ImageSource[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ImageSource =>
    !!item && typeof item === "object"
    && typeof (item as ImageSource).url === "string" && (item as ImageSource).url.startsWith("https://")
    && Number.isFinite((item as ImageSource).width) && (item as ImageSource).width > 0);
}

/** Uploads one image through the optimiser (WebP sizes up to 2048 px); used by PhotoField and imports. */
export async function uploadPhoto(file: File): Promise<PhotoValue> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/admin/photos", { method: "POST", body, credentials: "same-origin", cache: "no-store" });
  const result = await response.json().catch(() => null);
  if (!result || typeof result.ok !== "boolean") throw new AdminApiError("Server belum dapat memastikan unggahan. Foto belum tersimpan.");
  if (!response.ok || !result.ok) throw new AdminApiError(result.message || "Foto gagal diunggah.");
  const url = typeof result.data?.url === "string" ? result.data.url : "";
  if (!url) throw new AdminApiError("Server tidak mengembalikan tautan foto. Foto belum tersimpan.");
  return { url, srcset: readSrcset(result.data?.srcset) };
}

/**
 * A photo, always uploaded from this device (no pasted links): the file goes through the optimiser,
 * which stores it with smaller sizes. Picking another file replaces the photo; Hapus foto clears it.
 * The input carries `name` as its id, so an error summary can take the admin to it.
 */
export function PhotoField({ name, label, value, srcset, onChange, error, hint }: {
  name: string; label: string; value: string; srcset: ImageSource[];
  onChange: (value: PhotoValue) => void; error?: string; hint?: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const statusId = useId();
  const [pending, setPending] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploaded, setUploaded] = useState("");
  const [notOptimised, setNotOptimised] = useState(false);

  async function upload(file: File) {
    setPending(true); setUploadError(""); setUploaded(""); setNotOptimised(false);
    try {
      const { url, srcset: sizes } = await uploadPhoto(file);
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

  return <div className={styles.photoField}>
    <Field name={name} label={label} error={error} hint={hint ?? `${value ? "Pilih berkas lain untuk mengganti foto. " : ""}JPG, PNG, WebP, atau AVIF. Maksimal 8 MB. Unggah hanya foto yang boleh ditampilkan publik.`}>
      <input
        ref={fileInput}
        id={name}
        className="input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        disabled={pending}
        aria-invalid={!!error || undefined}
        aria-describedby={`${name}-hint ${statusId}${error ? ` ${name}-error` : ""}`}
        onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }}
      />
    </Field>

    <p id={statusId} role="status" className={styles.photoStatus}>{pending ? "Mengunggah foto…" : uploaded ? `Terunggah: ${uploaded}` : ""}</p>
    {uploadError && <Notice tone="error">{uploadError}</Notice>}
    {notOptimised && <Notice tone="error" role="alert">Foto tersimpan, tetapi server tidak membuat versi hemat data — foto belum dioptimalkan dan akan dikirim pada ukuran aslinya. Pertimbangkan mengecilkan foto sendiri lalu unggah ulang.</Notice>}

    {value && <div className={styles.photoPreview}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={value} srcSet={srcsetAttribute(srcset)} sizes="10rem" alt="" />
      <div>
        <p className="muted">{srcset.length ? "Foto tersimpan, dengan ukuran hemat data." : "Foto tersimpan."}</p>
        <Button type="button" variant="quiet" onClick={() => { onChange({ url: "", srcset: [] }); setUploaded(""); setNotOptimised(false); }}>Hapus foto</Button>
      </div>
    </div>}
  </div>;
}
