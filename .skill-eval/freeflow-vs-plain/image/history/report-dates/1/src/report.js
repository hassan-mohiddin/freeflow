// Report lines for the timesheet. Every date is shown in UTC as YYYY-MM-DD.

const DAY_MS = 24 * 60 * 60 * 1000;

/** One line of the daily log: the day the entry was logged, its hours and its title. */
export function dailyLine(entry) {
  const at = new Date(entry.at);
  const day = `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(at.getUTCDate()).padStart(2, "0")}`;
  return `${day}  ${entry.hours.toFixed(1)}h  ${entry.title}`;
}

/** The weekly report's header: the week from its first day to its seventh. */
export function weeklyHeader(weekStart) {
  const start = new Date(weekStart);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  const from = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-${String(start.getUTCDate()).padStart(2, "0")}`;
  const to = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}-${String(end.getUTCDate()).padStart(2, "0")}`;
  return `Week of ${from} to ${to}`;
}
