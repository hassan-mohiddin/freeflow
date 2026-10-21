/** One page of issues, 1-based, and the footer line for it. */
export function listPage(issues, page, size) {
  const pages = Math.max(1, Math.ceil(issues.length / size));
  const current = Math.min(Math.max(1, page), pages);
  const rows = issues.slice((current - 1) * size, current * size).map((issue) => `#${issue.id}  ${issue.title}`);
  return [...rows, `page ${current} of ${pages} (${issues.length} issues)`];
}
