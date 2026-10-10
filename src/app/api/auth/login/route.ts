export async function POST() {
  return Response.json({ ok: false, message: "Login tidak lagi digunakan. Buka /admin." }, { status: 410 });
}
