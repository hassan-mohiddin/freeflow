import { greet, hoursLine, isOpen } from "./greet.js";

/** Both lines of the door screen. */
export function screen(name, hour) {
  return [greet(name), isOpen(hour) ? hoursLine() : "Closed, see you tomorrow"].join("\n");
}
