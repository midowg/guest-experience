/** "Simpan foto": starts the download of `href` under `name` (an anchor with the download attribute, clicked). The browser saves it; nothing navigates. */
export function saveFile(href: string, name: string): void {
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** An iPhone or iPad (also an iPad that says it is a Mac): a download lands in Files there, the share sheet is the way to Photos. */
export function isApplePhone(nav: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints"> = navigator): boolean {
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
}

/**
 * "Simpan asli di HP": keeps the original (no sign, no tone) on the phone. Call it from the tap that sends (a share sheet needs the
 * tap). On an iPhone the share sheet (Save Image) when the browser takes files; everywhere else a plain download. Resolves "dibagikan"
 * or "diunduh" when it was handed over, "dibatalkan" when the person closed the share sheet; it throws when saving is not possible
 * (the caller says so calmly and still sends the photo).
 */
export async function saveOriginal(file: File): Promise<"diunduh" | "dibagikan" | "dibatalkan"> {
  if (isApplePhone() && typeof navigator.canShare === "function" && typeof navigator.share === "function" && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return "dibagikan"; }
    catch (error) { if (error instanceof DOMException && error.name === "AbortError") return "dibatalkan"; throw error; }
  }
  const href = URL.createObjectURL(file);
  try { saveFile(href, file.name); } finally { window.setTimeout(() => URL.revokeObjectURL(href), 60_000); }
  return "diunduh";
}
