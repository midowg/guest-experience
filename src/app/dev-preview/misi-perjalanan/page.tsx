import { notFound } from "next/navigation";
import { MissionJourney } from "@/components/pra-wam/mission/MissionJourney";
import type { MissionView } from "@/lib/pra-wam/mission";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";

/*
 * Layout check for Misi Perjalanan without signing in, with made-up people only (the real room
 * list stays in pw_settings). ?peran=bod for a BoD who is the CEO, ?peran=cos for a CoS without a room.
 */
const mate = (name: string, nick: string, dept: string) => ({ name, nick, dept, sleep: "22.00–24.00", wake: "05.00–06.30",
  hints: [`Petunjuk pertama tentang ${nick} (contoh).`, `Petunjuk kedua tentang ${nick} (contoh).`, `Petunjuk ketiga tentang ${nick} (contoh).`] });

export default async function DevMissionPage({ searchParams }: { searchParams: Promise<{ peran?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const role = (await searchParams).peran;
  const hod: MissionView = {
    employeeId: "dev-hod", nick: "Rani", role: "HoD", ceo: false, sentences: [6, 12],
    room: {
      code: "A3", mates: [mate("Contoh Satu", "Satu", "Departemen Contoh"), mate("Contoh Dua", "Dua", "Departemen Lain")],
      self: { sleep: "Sebelum 22.00", wake: "Sebelum 05.00" },
      others: ["Contoh Satu", "Contoh Dua", "Contoh Tiga", "Contoh Empat", "Contoh Lima", "Contoh Enam"].map(name => ({ id: name.toUpperCase(), name })),
    },
  };
  const view: MissionView = role === "bod" ? { employeeId: "dev-bod", nick: "Bima", role: "BoD", ceo: true, sentences: [1], room: null }
    : role === "cos" ? { employeeId: "dev-cos", nick: "Citra", role: "CoS", ceo: false, sentences: [], room: null }
    : hod;
  return <div className={styles.app} style={{ padding: 16 }}><MissionJourney view={view} detailHref="#" /></div>;
}
