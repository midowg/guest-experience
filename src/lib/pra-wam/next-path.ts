/**
 * Only WAM pages, Booking Kantor's (/booking) and Wellbeing's (/wlm, 18 Nov 2026; was /wellbeing), which sign
 * in with the same account, are allowed as the place to go after signing in; never a sign-in page
 * itself (Main WAM's /wam/acara/masuk included). No server code: the frame uses it too.
 */
export function safePraWamNext(value: string | null | undefined): string | null {
  if (!value || !/^\/(?:wam|booking|wlm|wellbeing)(?:[/?#]|$)/.test(value) || /^\/(?:wam\/login|wam\/acara\/masuk|wlm\/masuk|wellbeing\/masuk)(?:[/?#]|$)/.test(value) || /[\\\s]/.test(value)) return null;
  return value;
}
