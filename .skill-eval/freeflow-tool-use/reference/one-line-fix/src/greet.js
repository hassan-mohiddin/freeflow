const HOURS = { open: 9, close: 18 };

/** The line on the door screen for a visitor. */
export function greet(name) {
  return `Hello, ${name}!`;
}

/** Whether the shop is open at an hour of the day (0-23). */
export function isOpen(hour) {
  return hour >= HOURS.open && hour < HOURS.close;
}

/** The screen's second line. */
export function hoursLine() {
  return `Open ${HOURS.open}:00 to ${HOURS.close}:00`;
}
