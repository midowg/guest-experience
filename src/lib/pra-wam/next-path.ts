/**
 * Only WAM pages, Booking Kantor's (/booking) and Wellbeing's (/wellbeing, 17 Nov 2026), which sign
 * in with the same account, are allowed as the place to go after signing in; never a sign-in page
 * itself. No server code: the frame uses it too.
 */
export function safePraWamNext(value: string | null | undefined): string | null {
  if (!value || !/^\/(?:wam|booking|wellbeing)(?:[/?#]|$)/.test(value) || /^\/(?:wam\/login|wellbeing\/masuk)(?:[/?#]|$)/.test(value) || /[\\\s]/.test(value)) return null;
  return value;
}
