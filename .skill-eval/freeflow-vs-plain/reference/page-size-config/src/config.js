// Settings for the issue list.

const DEFAULT_PAGE_SIZE = 50;

/** How many issues one page shows: PAGE_SIZE when it is a positive whole number, else the default. */
export function pageSize(environment = process.env) {
  const value = environment.PAGE_SIZE;
  return typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : DEFAULT_PAGE_SIZE;
}
