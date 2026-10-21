export function formatJob(job) {
  const mark = job.priority === "high" ? "!" : "";
  return `${job.id} ${mark}${job.name} [${job.status}]`;
}
