/** YYYY-MM-DD ↔ Date helpers for `stock_moves.schedule_date` (a DATE column, UTC midnight). */

export function parseScheduleDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
