import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/shared/AdminShell";
import { AnswerTable } from "@/components/admin/wam/questionnaire/AnswerTable";
import { ConsoleTheme } from "@/components/console";
import type { AnswerTable as Table } from "@/lib/server/pra-wam/answer-table";

export const dynamic = "force-dynamic";

/** Layout check for Kuesioner → Rekap (one row per person) with sample people and answers. Sending a reminder is refused without a session. */
export default function DevRecapTablePage() {
  if (process.env.NODE_ENV === "production") notFound();
  const columns: Table["columns"] = [
    ["Kenalan dulu", "s0", "Siapa nama lengkap dan nama panggilanmu?", "rekan"],
    ["Kenalan dulu", "s0", "Kamu di departemen mana?", "rekan"],
    ["Kenalan dulu", "s0", "Posisimu sekarang?", "hr"],
    ["Kenalan dulu", "s0", "Siapa yang bisa dihubungi kalau terjadi sesuatu selama acara?", "hr"],
    ["Tentang kamu", "sB", "Kamu paling suka ngapain di luar kerjaan?", "rekan"],
    ["Tentang kamu", "sB", "Di dalam tim, peran apa yang biasanya kamu ambil?", "fasil"],
    ["Mimpi & bertahan", "sC", "Waktu kecil, kamu ingin jadi apa?", "pilih"],
    ["Nyaman saat menginap", "sA", "Kebiasaan tidur yang sebaiknya diketahui teman sekamar?", "hr"],
    ["Nyaman saat menginap", "sA", "Ada kondisi kesehatan atau obat rutin yang perlu panitia tahu supaya kamu aman?", "hronly"],
  ].map(([section, sectionId, prompt, visibility], index) => ({ key: String(index + 1), number: index + 1, prompt, section, sectionId, visibility: visibility as Table["columns"][number]["visibility"] }));
  const names = ["Ayu Lestari", "Bima Putra", "Citra Dewi", "Dimas Pratama", "Eka Sari", "Fajar Nugroho", "Gita Maharani", "Hendra Wijaya"];
  const departments = ["Comms", "Finance", "Human Capital", "Creative"];
  const rows: Table["rows"] = names.map((name, index) => {
    const state = index % 3 === 0 ? "selesai" : index % 3 === 1 ? "sedang" : "belum";
    const answers = ["", departments[index % 4], index % 4 === 0 ? "HOD" : "Staf", "Rina, kakak, 0812 0000 0000", "Musik, Traveling, Kuliner & masak", "Pencetus ide, Penengah",
      "Pilot. Waktu itu rasanya keren bisa melihat kota dari atas, dan sampai sekarang masih suka lihat pesawat lewat.", "Mendengkur, Pakai earplug", index % 2 ? "Asma, bawa inhaler" : ""];
    const filled = state === "selesai" ? answers.length : state === "sedang" ? 5 : 0;
    const cells: Record<string, string> = {};
    answers.slice(0, filled).forEach((text, at) => { const value = at === 0 ? `Contoh ${name} (${name.split(" ")[0]})` : text; if (value) cells[String(at + 1)] = value; });
    return { id: `p${index}`, name: `Contoh ${name}`, department: departments[index % 4], state, sectionsDone: state === "selesai" ? 5 : state === "sedang" ? 2 : 0, sectionsTotal: 5, lastActivity: state === "belum" ? null : "2026-11-10T03:00:00Z", cells };
  });
  const table: Table = {
    formName: "Cerita Kita", columns, rows, outside: 0,
    sections: [{ id: "s0", title: "Kenalan dulu" }, { id: "sB", title: "Tentang kamu" }, { id: "sC", title: "Mimpi & bertahan" }, { id: "sA", title: "Nyaman saat menginap" }],
    counts: { selesai: rows.filter(row => row.state === "selesai").length, sedang: rows.filter(row => row.state === "sedang").length, belum: rows.filter(row => row.state === "belum").length },
  };
  return <AdminShell bare><ConsoleTheme canvas><div style={{ padding: 24 }}><AnswerTable table={table} reminder={{ open: true, last: { at: "2026-11-10T02:00:00Z", recipients: 12 } }} /></div></ConsoleTheme></AdminShell>;
}
