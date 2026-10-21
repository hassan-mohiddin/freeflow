export class JobQueue {
  constructor() {
    this.jobs = [];
    this.nextId = 1;
  }

  static from(jobs) {
    const queue = new JobQueue();
    for (const job of jobs) {
      queue.jobs.push({ ...job });
      queue.nextId = Math.max(queue.nextId, job.id + 1);
    }
    return queue;
  }

  add(name, { priority = "normal" } = {}) {
    const job = { id: this.nextId++, name, status: "pending", priority };
    this.jobs.push(job);
    return job;
  }

  // The oldest pending job runs first.
  next() {
    const pending = this.jobs.filter((job) => job.status === "pending");
    return pending.find((job) => job.priority === "high") ?? pending[0] ?? null;
  }

  done(id) {
    const job = this.jobs.find((candidate) => candidate.id === id);
    if (!job) return false;
    job.status = "done";
    return true;
  }

  get size() {
    return this.jobs.length;
  }

  list() {
    return this.jobs.map((job) => ({ ...job }));
  }
}
