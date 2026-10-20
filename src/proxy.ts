import { NextResponse, type NextRequest } from "next/server";
import { adminAuthConfig, SESSION_COOKIE, verifySession } from "@/lib/admin-token";

// First gate for the admin area. Every admin page and API also checks the session itself.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();
  const config = adminAuthConfig();
  if (verifySession(config, request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, message: config ? "Sesi berakhir. Masuk kembali sebelum melanjutkan." : "Login admin belum disiapkan. Isi ADMIN_PASSWORD dan ADMIN_SESSION_SECRET pada server." },
      { status: config ? 401 : 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const login = new URL("/admin/login", request.url);
  if (pathname !== "/admin") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
