import "server-only";

export class ServiceError extends Error {
  constructor(public status: number, message: string, public fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = "ServiceError";
  }
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function publicConfig() {
  if (!isSupabaseConfigured()) throw new ServiceError(503, "Supabase belum dikonfigurasi. Admin perlu mengisi URL dan publishable key aplikasi.");
  return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! };
}

export function requirePrivilegedConfig() {
  const config = publicConfig();
  if (!process.env.SUPABASE_SECRET_KEY) throw new ServiceError(503, "Penyimpanan belum tersedia. Admin perlu mengisi SUPABASE_SECRET_KEY pada server.");
  return { ...config, secret: process.env.SUPABASE_SECRET_KEY };
}

export function rateLimitSecret(): string {
  if (!process.env.RATE_LIMIT_SECRET || process.env.RATE_LIMIT_SECRET.length < 32) {
    throw new ServiceError(503, "Perlindungan formulir belum tersedia. Admin perlu mengisi RATE_LIMIT_SECRET acak minimal 32 karakter pada server.");
  }
  return process.env.RATE_LIMIT_SECRET;
}
