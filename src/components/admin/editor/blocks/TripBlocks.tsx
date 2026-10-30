import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { OrderButtons } from "@/components/admin/editor/controls";
import { moveItem } from "@/components/admin/editor/editor-model";
import { BlockIntro, ImageInput } from "@/components/admin/editor/JourneyEditor";
import type { EditorKit } from "@/components/admin/editor/kit";
import { emptyTrip, TRIP_LIMITS, tripModes, type TripContent, type TripLeg, type TripMode, type TripPerson } from "@/lib/trip";
import styles from "@/components/admin/admin.module.css";

/** Client trip handbook (src/lib/trip.ts): one block per part, each switched on in Urutan & tampilan bagian. */
const modeLabels: Record<TripMode, string> = { train: "Kereta", flight: "Pesawat", bus: "Bus", car: "Mobil", boat: "Kapal" };
const newId = () => crypto.randomUUID();
const lines = (value: string) => value.split("\n");
const switchHint = (name: string) => <p className="field-hint">Aktifkan bagian &quot;{name}&quot; di Urutan &amp; tampilan bagian agar tampil. Bagian ini tidak tampil selama masih kosong.</p>;

function useTrip(kit: EditorKit) {
  const trip = kit.event.trip ?? emptyTrip();
  return <K extends keyof TripContent>(key: K, patch: Partial<TripContent[K]>) => kit.update("trip", { ...trip, [key]: { ...trip[key], ...patch } });
}

export function TransportBlock({ kit }: { kit: EditorKit }) {
  const { control, choices } = kit;
  const transport = (kit.event.trip ?? emptyTrip()).transport;
  const set = useTrip(kit);
  const setLeg = (index: number, patch: Partial<TripLeg>) => set("transport", { legs: transport.legs.map((leg, i) => i === index ? { ...leg, ...patch } : leg) });
  const path = (index: number, key: keyof TripLeg) => `trip.transport.legs.${index}.${key}`;
  return <div className="stack">
    <BlockIntro why="Perjalanan rombongan: kereta berangkat, pesawat pulang, atau bus antarkota. Tamu melihat nomor, jam, kursi, dan titik kumpul tanpa membuka tiket." who="tim tiket atau project manager" />
    {control("trip.transport.title", "Judul bagian (opsional)", transport.title, title => set("transport", { title }), { maxLength: 200, hint: "Kosongkan untuk memakai: Informasi perjalanan." })}
    {control("trip.transport.intro", "Pengantar (opsional)", transport.intro, intro => set("transport", { intro }), { multiline: true, maxLength: 1000 })}
    {transport.legs.map((leg, index) => <div className={styles.item} key={leg.id}>
      <div className={styles.itemHeader}><h4>{[leg.carrier, leg.number].filter(Boolean).join(" ") || `Perjalanan ${index + 1}`}</h4><OrderButtons label={`perjalanan ${index + 1}`} index={index} length={transport.legs.length} onMove={direction => set("transport", { legs: moveItem(transport.legs, index, direction) })} /></div>
      {choices(path(index, "mode"), "Jenis", tripModes.map(value => ({ value, label: modeLabels[value] })), leg.mode, mode => setLeg(index, { mode }))}
      {control(path(index, "carrier"), "Nama kereta / maskapai", leg.carrier, carrier => setLeg(index, { carrier }), { maxLength: 120, hint: "Contoh: Kereta Taksaka, Citilink." })}
      {control(path(index, "number"), "Nomor (opsional)", leg.number, number => setLeg(index, { number }), { maxLength: 60, hint: "Contoh: KA 46, QG 773." })}
      {control(path(index, "date"), "Tanggal", leg.date, date => setLeg(index, { date }), { maxLength: 80, hint: "Ditulis seperti dibaca tamu, misalnya Kamis, 5 November 2026." })}
      {control(path(index, "from"), "Dari", leg.from, from => setLeg(index, { from }), { maxLength: 150, hint: "Contoh: Stasiun Gambir (GMR)." })}
      {control(path(index, "to"), "Ke", leg.to, to => setLeg(index, { to }), { maxLength: 150 })}
      {control(path(index, "departs"), "Jam berangkat", leg.departs, departs => setLeg(index, { departs }), { maxLength: 40, hint: "Contoh: 07.45 WIB." })}
      {control(path(index, "arrives"), "Jam tiba", leg.arrives, arrives => setLeg(index, { arrives }), { maxLength: 40 })}
      {control(path(index, "seat"), "Kursi / terminal & bagasi (opsional)", leg.seat, seat => setLeg(index, { seat }), { multiline: true, maxLength: 300 })}
      {control(path(index, "meeting_point"), "Titik kumpul (opsional)", leg.meeting_point, meeting_point => setLeg(index, { meeting_point }), { maxLength: 300 })}
      {control(path(index, "meeting_time"), "Jam kumpul (opsional)", leg.meeting_time, meeting_time => setLeg(index, { meeting_time }), { maxLength: 80 })}
      {control(path(index, "note"), "Catatan (opsional)", leg.note, note => setLeg(index, { note }), { multiline: true, maxLength: 1000, hint: "Tulis di sini bila jam masih menunggu tiket final, jangan ditebak." })}
      <Button type="button" variant="danger" onClick={() => set("transport", { legs: transport.legs.filter((_, i) => i !== index) })}><Trash2 size={17} aria-hidden="true" /><span>Hapus perjalanan {index + 1}</span></Button>
    </div>)}
    <Button type="button" variant="secondary" disabled={transport.legs.length >= TRIP_LIMITS.legs} onClick={() => set("transport", { legs: [...transport.legs, { id: newId(), mode: "train", carrier: "", number: "", date: "", from: "", to: "", departs: "", arrives: "", seat: "", meeting_point: "", meeting_time: "", note: "" }] })}>Tambah perjalanan</Button>
    {switchHint("Transportasi")}
  </div>;
}

export function StayBlock({ kit }: { kit: EditorKit }) {
  const { control, errors } = kit;
  const stay = (kit.event.trip ?? emptyTrip()).stay;
  const set = useTrip(kit);
  return <div className="stack">
    <BlockIntro why="Hotel rombongan: alamat, check-in dan check-out, tempat dan jam sarapan, serta titik kumpul harian." who="tim akomodasi" />
    {control("trip.stay.title", "Judul bagian (opsional)", stay.title, title => set("stay", { title }), { maxLength: 200, hint: "Kosongkan untuk memakai: Tempat menginap." })}
    {control("trip.stay.name", "Nama hotel", stay.name, name => set("stay", { name }), { maxLength: 200 })}
    {control("trip.stay.address", "Alamat", stay.address, address => set("stay", { address }), { multiline: true, maxLength: 500 })}
    {control("trip.stay.maps_url", "Tautan Maps (opsional)", stay.maps_url, maps_url => set("stay", { maps_url }), { type: "url", maxLength: 8000 })}
    {control("trip.stay.phone", "Telepon hotel (opsional)", stay.phone, phone => set("stay", { phone }), { maxLength: 30, hint: "Nomor kantor boleh, misalnya 0274-2920101." })}
    {control("trip.stay.check_in", "Check-in", stay.check_in, check_in => set("stay", { check_in }), { maxLength: 80, hint: "Contoh: 5 November 2026." })}
    {control("trip.stay.check_out", "Check-out", stay.check_out, check_out => set("stay", { check_out }), { maxLength: 80 })}
    {control("trip.stay.breakfast_place", "Tempat sarapan (opsional)", stay.breakfast_place, breakfast_place => set("stay", { breakfast_place }), { maxLength: 150 })}
    {control("trip.stay.breakfast_time", "Jam sarapan (opsional)", stay.breakfast_time, breakfast_time => set("stay", { breakfast_time }), { maxLength: 80 })}
    {control("trip.stay.meeting_point", "Titik kumpul harian (opsional)", stay.meeting_point, meeting_point => set("stay", { meeting_point }), { maxLength: 200 })}
    {control("trip.stay.note", "Catatan (opsional)", stay.note, note => set("stay", { note }), { multiline: true, maxLength: 1000 })}
    {stay.photos.map((photo, index) => <div className={styles.item} key={index}>
      <ImageInput name={`trip.stay.photos.${index}`} label={`Foto hotel ${index + 1}`} image={photo} onChange={image => set("stay", { photos: stay.photos.map((item, i) => i === index ? image : item) })} control={control} errors={errors} />
      <Button type="button" variant="danger" onClick={() => set("stay", { photos: stay.photos.filter((_, i) => i !== index) })}><Trash2 size={17} aria-hidden="true" /><span>Hapus foto {index + 1}</span></Button>
    </div>)}
    <Button type="button" variant="secondary" disabled={stay.photos.length >= TRIP_LIMITS.photos} onClick={() => set("stay", { photos: [...stay.photos, { url: "", alt: "", srcset: [] }] })}>Tambah foto hotel</Button>
    {switchHint("Hotel")}
  </div>;
}

export function GuidelinesBlock({ kit }: { kit: EditorKit }) {
  const { control } = kit;
  const guidelines = (kit.event.trip ?? emptyTrip()).guidelines;
  const set = useTrip(kit);
  return <div className="stack">
    <BlockIntro why="Yang dianjurkan dan yang perlu dihindari selama kegiatan, serta kabar cuaca singkat." who="project manager" />
    {control("trip.guidelines.title", "Judul bagian (opsional)", guidelines.title, title => set("guidelines", { title }), { maxLength: 200, hint: "Kosongkan untuk memakai: Panduan selama kegiatan." })}
    {control("trip.guidelines.intro", "Pengantar (opsional)", guidelines.intro, intro => set("guidelines", { intro }), { multiline: true, maxLength: 1000 })}
    {control("trip.guidelines.weather", "Cuaca (opsional)", guidelines.weather, weather => set("guidelines", { weather }), { multiline: true, maxLength: 1000, hint: "Sebutkan sumber dan tanggalnya, misalnya prakiraan BMKG." })}
    {control("trip.guidelines.dos", "Yang dianjurkan (satu per baris)", guidelines.dos.join("\n"), value => set("guidelines", { dos: lines(value) }), { multiline: true, hint: `Maksimal ${TRIP_LIMITS.lines} baris.` })}
    {control("trip.guidelines.donts", "Yang perlu dihindari (satu per baris)", guidelines.donts.join("\n"), value => set("guidelines", { donts: lines(value) }), { multiline: true, hint: `Maksimal ${TRIP_LIMITS.lines} baris.` })}
    {switchHint("Do & don't")}
  </div>;
}

export function ContactsBlock({ kit }: { kit: EditorKit }) {
  const { control } = kit;
  const contacts = (kit.event.trip ?? emptyTrip()).contacts;
  const set = useTrip(kit);
  const setPerson = (index: number, patch: Partial<TripPerson>) => set("contacts", { people: contacts.people.map((person, i) => i === index ? { ...person, ...patch } : person) });
  return <div className="stack">
    <BlockIntro why="Semua orang yang bisa dihubungi tamu selama trip: project manager, PIC klien, hotel, dan rumah sakit terdekat. Nomor HP mendapat tombol WhatsApp; nomor kantor hanya tombol telepon." who="project manager" />
    {control("trip.contacts.title", "Judul bagian (opsional)", contacts.title, title => set("contacts", { title }), { maxLength: 200, hint: "Kosongkan untuk memakai: Kontak bantuan." })}
    {control("trip.contacts.intro", "Pengantar (opsional)", contacts.intro, intro => set("contacts", { intro }), { multiline: true, maxLength: 1000 })}
    {contacts.people.map((person, index) => <div className={styles.item} key={person.id}>
      <div className={styles.itemHeader}><h4>{person.name || `Kontak ${index + 1}`}</h4><OrderButtons label={`kontak ${index + 1}`} index={index} length={contacts.people.length} onMove={direction => set("contacts", { people: moveItem(contacts.people, index, direction) })} /></div>
      {control(`trip.contacts.people.${index}.role`, "Peran", person.role, role => setPerson(index, { role }), { maxLength: 120, hint: "Contoh: Project Manager, PIC Surya Madistrindo, Hotel." })}
      {control(`trip.contacts.people.${index}.name`, "Nama", person.name, name => setPerson(index, { name }), { maxLength: 150 })}
      {control(`trip.contacts.people.${index}.phone`, "Nomor", person.phone, phone => setPerson(index, { phone }), { maxLength: 30 })}
      <Button type="button" variant="danger" onClick={() => set("contacts", { people: contacts.people.filter((_, i) => i !== index) })}><Trash2 size={17} aria-hidden="true" /><span>Hapus kontak {index + 1}</span></Button>
    </div>)}
    <Button type="button" variant="secondary" disabled={contacts.people.length >= TRIP_LIMITS.people} onClick={() => set("contacts", { people: [...contacts.people, { id: newId(), role: "", name: "", phone: "" }] })}>Tambah kontak</Button>
    {control("trip.contacts.hospital", "Rumah sakit terdekat (opsional)", contacts.hospital, hospital => set("contacts", { hospital }), { maxLength: 200 })}
    {control("trip.contacts.hospital_phone", "Telepon rumah sakit (opsional)", contacts.hospital_phone, hospital_phone => set("contacts", { hospital_phone }), { maxLength: 30 })}
    {control("trip.contacts.hospital_address", "Alamat rumah sakit (opsional)", contacts.hospital_address, hospital_address => set("contacts", { hospital_address }), { multiline: true, maxLength: 500 })}
    {control("trip.contacts.hospital_maps_url", "Tautan Maps rumah sakit (opsional)", contacts.hospital_maps_url, hospital_maps_url => set("contacts", { hospital_maps_url }), { type: "url", maxLength: 8000 })}
    {switchHint("Kontak bantuan")}
  </div>;
}
