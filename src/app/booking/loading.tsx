import bk from "@/components/booking/booking.module.css";
import { AppLoading } from "@/components/ui/AppLoading";

/** Booking Kantor's own loading screen (19 Nov 2026), in its colours, light or dark as the device is. */
export default function BookingLoading() {
  return <div className={bk.app}><AppLoading tone="booking" name="Booking Kantor" /></div>;
}
