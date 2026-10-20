export class JobQueue {
  constructor({ maxSize = Infinity } = {}) {
    this.jobs = [];
    this.nextId = 1;
    this.maxSize = maxSize;
  }

  static from(jobs) {
    const queue = new JobQueue();
    for (const job of jobs) {
      queue.jobs.push({ ...job });
      queue.nextId = Math.max(queue.nextId, job.id + 1);
    }
    return queue;
  }

  add(name) {
    const job = { id: this.nextId++, name, status: "pending" };
    this.jobs.push(job);
    while (this.jobs.length > this.maxSize) this.jobs.shift();
    return job;
  }

  // The oldest pending job runs first.
  next() {
    return this.jobs.find((job) => job.status === "pending") ?? null;
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
