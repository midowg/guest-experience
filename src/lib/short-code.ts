/** Event codes: 6 characters without I, L or O (`AB23CD`). Personal short tokens: 8 lowercase, same rule. */
export const EVENT_CODE = /^[A-HJKMNP-Z2-9]{6}$/;
export const SHORT_TOKEN = /^[a-hjkmnp-z2-9]{8}$/;

/**
 * A code as typed in an address. Lowercase is accepted and should be redirected to the canonical
 * uppercase form; anything else is not a code at all.
 */
export function readEventCode(value: string): { code: string; canonical: boolean } | null {
  const code = value.toUpperCase();
  return EVENT_CODE.test(code) ? { code, canonical: code === value } : null;
}

export const isShortToken = (value: string) => SHORT_TOKEN.test(value);
/** An event's id (a UUID), as opposed to its short code. */
export const isEventId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
