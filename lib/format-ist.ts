/** Format a date/timestamp string in IST (Asia/Kolkata) consistently, regardless of server timezone. */

const IST: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata' };

/** Full date + time in IST, e.g. "27/11/2026, 10:30:00 pm" */
export function formatIST(ts: string | Date): string {
  return new Date(ts).toLocaleString('en-IN', IST);
}

/** Date-only in IST, e.g. "27/11/2026" */
export function formatISTDate(ts: string | Date): string {
  return new Date(ts).toLocaleDateString('en-IN', IST);
}
