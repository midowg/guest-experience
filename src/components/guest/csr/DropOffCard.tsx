import { Clock, Compass, MapPin, MessageCircle, Navigation } from "lucide-react";
import { dropOffMap, type DropOff } from "@/lib/donations";
import s from "./csr.module.css";

/** Where to bring goods: the place, its address and hours, a map, the way there (Panduan lokasi) and someone to ask. */
export function DropOffCard({ place, contact, onGuide }: { place: DropOff; contact?: { href: string; name: string } | null; onGuide?: () => void }) {
  return <section className={s.dropOff} aria-labelledby="antar-barang">
    <p id="antar-barang" className={s.dropOffLabel}><MapPin size={16} aria-hidden="true" /> Antar barang ke</p>
    {place.name && <p className={s.dropOffName}>{place.name}</p>}
    <p className={s.dropOffAddress}>{place.address}</p>
    {place.hours && <p className={s.dropOffHours}><Clock size={14} aria-hidden="true" /> {place.hours}</p>}
    <div className={s.dropOffActions}>
      <a className={s.dropOffMap} href={dropOffMap(place)} target="_blank" rel="noopener noreferrer"><Navigation size={16} aria-hidden="true" /> Buka di Maps</a>
      {onGuide && <button type="button" className={s.dropOffAsk} onClick={onGuide}><Compass size={16} aria-hidden="true" /> Panduan ke lokasi</button>}
      {contact && <a className={s.dropOffAsk} href={contact.href} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden="true" /> Tanya {contact.name || "panitia"}</a>}
    </div>
  </section>;
}
