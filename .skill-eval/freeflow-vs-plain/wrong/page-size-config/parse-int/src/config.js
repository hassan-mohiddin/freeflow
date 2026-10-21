// Wrong on purpose: parseInt accepts "2.5" as 2 and "10abc" as 10.
const DEFAULT_PAGE_SIZE = 50;

export function pageSize() {
  const parsed = Number.parseInt(process.env.PAGE_SIZE ?? "", 10);
  return parsed > 0 ? parsed : DEFAULT_PAGE_SIZE;
}
