import { notFound } from "next/navigation";
import { MissionJourney } from "@/components/pra-wam/mission/MissionJourney";
import type { MissionView } from "@/lib/pra-wam/mission";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";

/*
 * Layout check for Misi Perjalanan without signing in, with made-up people only (the real room
 * list stays in pw_settings). ?peran=bod for a BoD who is the CEO, ?peran=cos for a CoS without a room.
 */
const choice = (name: string) => ({ id: name.toUpperCase(), name, nick: name.split(" ")[1] ?? "" });
const mate = (name: string, nick: string, dept: string, decoys: string[]) => ({ name, nick, dept, sleep: "22.00–24.00", wake: "05.00–06.30",
  hints: [`Petunjuk pertama tentang ${nick} (contoh).`, `Petunjuk kedua tentang ${nick} (contoh).`, `Petunjuk ketiga tentang ${nick} (contoh).`],
  // A question per hint, the other names changing (as the server makes them).
  questions: [[decoys[0], name, decoys[1]], [name, decoys[1], decoys[2]], [decoys[2], decoys[0], name]].map(names => ({ choices: names.map(choice) })) });

export default async function DevMissionPage({ searchParams }: { searchParams: Promise<{ peran?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const role = (await searchParams).peran;
  const hod: MissionView = {
    employeeId: "dev-hod", name: "Rani Contoh", nick: "Rani", role: "HoD", ceo: false, sentences: [6, 12],
    room: {
      code: "A3", mates: [mate("Contoh Satu", "Satu", "Departemen Contoh", ["Contoh Tiga", "Contoh Empat", "Contoh Lima"]), mate("Contoh Dua", "Dua", "Departemen Lain", ["Contoh Enam", "Contoh Tiga", "Contoh Empat"])],
      self: { sleep: "Sebelum 22.00", wake: "Sebelum 05.00" },
    },
  };
  const view: MissionView = role === "bod" ? { employeeId: "dev-bod", name: "Bima Contoh", nick: "Bima", role: "BoD", ceo: true, sentences: [1], room: null }
    : role === "cos" ? { employeeId: "dev-cos", name: "Citra Contoh", nick: "Citra", role: "CoS", ceo: false, sentences: [], room: null }
    : hod;
  return <div className={styles.app} style={{ padding: 16 }}><MissionJourney view={view} detailHref="#" /></div>;
}
