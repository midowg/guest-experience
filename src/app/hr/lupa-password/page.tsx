import { BookingForgot } from "@/components/booking/BookingAuth";
import css from "@/components/booking/booking.module.css";
import hr from "@/components/hr/hr.module.css";

export const metadata = { title: "Lupa password" };

/** Lupa password: a request to reset the account to the first password (the same requests as WAM's). */
export default function HrForgotPage() {
  return <div className={`${css.app} ${hr.bk}`}><BookingForgot app="hr" /></div>;
}
