import { NextResponse, type NextRequest } from "next/server";
import { adminAuthConfig, readSession, SESSION_COOKIE } from "@/lib/admin-token";
import { ADMIN_PATH_HEADER } from "@/lib/admin-access";

// First gate for the admin area. Every admin page and API also checks the session itself, and,
// for a personal admin, their grant for the part of the admin asked for: the path goes along in
// ADMIN_PATH_HEADER (set here, so whatever a browser sent under that name is replaced).
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();
  const config = adminAuthConfig();
  if (readSession(config, request.cookies.get(SESSION_COOKIE)?.value)) {
    const forwarded = new Headers(request.headers);
    forwarded.set(ADMIN_PATH_HEADER, pathname);
    return NextResponse.next({ request: { headers: forwarded } });
  }
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
