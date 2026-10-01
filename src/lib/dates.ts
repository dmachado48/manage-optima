/** Day helpers in Europe/Lisbon for desk queries. */

const TZ = "Europe/Lisbon";

export function startOfDay(date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  // Store as UTC midnight of the calendar date (Prisma @db.Date)
  return new Date(`${y}-${m}-${d}T00:00:00.000Z`);
}

export function endOfDay(date = new Date()): Date {
  const start = startOfDay(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

export function monthBounds(year: number, month: number): {
  start: Date;
  end: Date;
} {
  // month: 1-12
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${String(m).padStart(2, "0")}min`;
}

export function formatDatePt(date: Date): string {
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
