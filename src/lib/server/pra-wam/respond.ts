import "server-only";
import { NextResponse } from "next/server";
import { failure } from "../http";
import { BookingConflict } from "./appraisal";

/** Like `handle`, but a taken room or a busy participant also carries what to offer instead. */
export async function handleBooking(fn: () => Promise<Response>): Promise<Response> {
  try { return await fn(); } catch (error) {
    if (error instanceof BookingConflict) return NextResponse.json({ ok: false, message: error.message, conflict: error.details }, { status: 409, headers: { "Cache-Control": "no-store" } });
    return failure(error);
  }
}
