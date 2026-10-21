// Report lines for the timesheet. Every date is shown in UTC as YYYY-MM-DD.

const DAY_MS = 24 * 60 * 60 * 1000;

/** A date as YYYY-MM-DD in UTC. An invalid date gives NaN-NaN-NaN, as the reports always printed. */
function utcDay(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** One line of the daily log: the day the entry was logged, its hours and its title. */
export function dailyLine(entry) {
  return `${utcDay(new Date(entry.at))}  ${entry.hours.toFixed(1)}h  ${entry.title}`;
}

/** The weekly report's header: the week from its first day to its seventh. */
export function weeklyHeader(weekStart) {
  const start = new Date(weekStart);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  return `Week of ${utcDay(start)} to ${utcDay(end)}`;
}

/** A task's due label for the board. */
export function dueLabel(task) {
  if (!task.due) return "no due date";
  const due = new Date(task.due);
  if (Number.isNaN(due.getTime())) return "due date unreadable";
  return `due ${utcDay(due)}`;
}
