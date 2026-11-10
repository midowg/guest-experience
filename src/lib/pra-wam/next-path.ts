/**
 * Only WAM pages, and Booking Kantor's (/booking, which signs in with the same account), are
 * allowed as the place to go after signing in. No server code: the frame uses it too.
 */
export function safePraWamNext(value: string | null | undefined): string | null {
  if (!value || !/^\/(?:wam|booking)(?:[/?#]|$)/.test(value) || /^\/wam\/login(?:[/?#]|$)/.test(value) || /[\\\s]/.test(value)) return null;
  return value;
}
