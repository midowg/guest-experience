import { BookingForgot } from "@/components/booking/BookingAuth";
import css from "@/components/booking/booking.module.css";

export const metadata = { title: "Lupa password" };

/** Lupa password: a request to reset the account to the first password, with no sign-in. */
export default function BookingForgotPage() {
  return <div className={css.app}><BookingForgot /></div>;
}
