/*
 * How many screens deep the in-app trail is (the shell keeps it, MainWamShell). A screen that closes
 * itself (a sheet with its own address, Detail sesi) goes back when there is something to go back to
 * inside the app, and replaces itself with its parent when it was opened from outside (a notification,
 * a QR), so closing never leaves the app.
 */
let depth = 0;
export const setTrailDepth = (value: number) => { depth = value; };
export const hasTrail = () => depth >= 2;
