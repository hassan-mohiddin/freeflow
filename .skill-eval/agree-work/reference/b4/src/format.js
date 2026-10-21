export function formatJob(job) {
  const date = job.createdAt ? job.createdAt.slice(0, 10) : "-";
  return `${job.id} ${job.name} (${date}) [${job.status}]`;
}
