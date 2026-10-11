export function parseContactPhone(value: string): { local: string; international: string } | null {
  const phone = value.trim();
  if (!/^\+?[\d\s().-]+$/.test(phone)) return null;
  const digits = phone.replace(/\D/g, "");
  const local = phone.startsWith("+") || digits.startsWith("62") ? `0${digits.slice(2)}` : digits;
  if (phone.startsWith("+") && !phone.startsWith("+62")) return null;
  if (!/^08\d{8,11}$/.test(local)) return null;
  return { local, international: `62${local.slice(1)}` };
}
