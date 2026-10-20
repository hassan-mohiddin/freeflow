import { pathToFileURL } from "node:url";
import { JobQueue } from "./queue.js";
import { formatJob } from "./format.js";
import { load, save, DEFAULT_PATH } from "./store.js";

// Runs one command and returns { code, out } so tests can call it directly.
export function run(argv, { path = DEFAULT_PATH } = {}) {
  const [command, ...args] = argv;
  const queue = JobQueue.from(load(path));
  const out = [];

  switch (command) {
    case "add": {
      const job = queue.add(args.join(" "));
      save(queue.list(), path);
      out.push(`Added ${job.id}`);
      break;
    }
    case "list": {
      let jobs = queue.list();
      const at = args.indexOf("--status");
      if (at !== -1) {
        const wanted = String(args[at + 1] ?? "");
        const status = wanted.toLowerCase();
        if (status !== "pending" && status !== "done") return { code: 1, out: `Unknown status: ${wanted}` };
        jobs = jobs.filter((job) => job.status === status);
      }
      for (const job of jobs) out.push(formatJob(job));
      break;
    }
    case "done": {
      const id = Number(args[0]);
      if (!queue.done(id)) return { code: 1, out: `No job ${args[0]}` };
      save(queue.list(), path);
      out.push(`Done ${id}`);
      break;
    }
    default:
      return { code: 1, out: `Unknown command: ${command ?? ""}`.trim() };
  }
  return { code: 0, out: out.join("\n") };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { code, out } = run(process.argv.slice(2));
  if (out) console.log(out);
  process.exitCode = code;
}
