import { z } from "zod";

/*
 * The new password a person picks after the shared first one. Checked in the form as they type
 * and again on the server, which also refuses the shared first password itself.
 */

export const passwordRules = [
  { id: "length", label: "Minimal 8 karakter", test: (value: string) => value.length >= 8 },
  { id: "mixed", label: "Ada angka atau simbol", test: (value: string) => /[^A-Za-z]/.test(value) },
] as const;

export const passwordProblems = (value: string) => passwordRules.filter(rule => !rule.test(value)).map(rule => rule.label);

export const passwordChangeSchema = z.object({
  current: z.string().min(1, "Isi password saat ini.").max(200),
  next: z.string().max(200).refine(value => passwordProblems(value).length === 0, "Password baru minimal 8 karakter dan ada angka atau simbol."),
  confirm: z.string().max(200),
}).refine(input => input.next === input.confirm, { path: ["confirm"], message: "Ulangi password baru dengan sama persis." })
  .refine(input => input.next !== input.current, { path: ["next"], message: "Password baru harus berbeda dari password saat ini." });
