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
