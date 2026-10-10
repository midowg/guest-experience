export async function POST() {
  return Response.json({ ok: false, message: "Aplikasi tidak lagi memakai sesi login." }, { status: 410 });
}
