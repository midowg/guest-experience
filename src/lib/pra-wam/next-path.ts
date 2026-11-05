/** Only WAM pages are allowed as the place to go after signing in. No server code: the frame uses it too. */
export function safePraWamNext(value: string | null | undefined): string | null {
  if (!value || !/^\/wam(?:[/?#]|$)/.test(value) || /^\/wam\/login(?:[/?#]|$)/.test(value) || /[\\\s]/.test(value)) return null;
  return value;
}
