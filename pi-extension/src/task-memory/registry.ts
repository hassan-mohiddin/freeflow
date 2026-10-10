import { execFile } from "node:child_process";
import { cp, mkdir, readdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";

/**
 * The registry: projects, registered tasks, their parents, and which session owns each record. One JSON file under
 * the Freeflow home (FREEFLOW_HOME, default ~/.freeflow), shared by every Pi session. Each project keeps its records in
 * a store under the home, created by Track Work's own init so a record stays a Track Work record. The registry is
 * canonical for membership, parentage and ownership; records are canonical for task content.
 */
const run = promisify(execFile);

export type Owner = Readonly<{ session: string; file?: string; since: string }>;
export type RegisteredTask = Readonly<{
  record: string;
  project: string;
  title: string;
  parent?: string;
  owner?: Owner;
}>;
export type Project = Readonly<{ name: string; store: string; repos: readonly string[] }>;
type Data = { version: 1; projects: Record<string, Project>; tasks: Record<string, RegisteredTask> };

export class RegistryError extends Error {}

export function freeflowHome(): string {
  return process.env.FREEFLOW_HOME || join(homedir(), ".freeflow");
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "project"
  );
}

const empty = (): Data => ({ version: 1, projects: {}, tasks: {} });

export class Registry {
  constructor(
    private readonly packageRoot: string,
    private readonly home = freeflowHome(),
  ) {}

  private get path(): string {
    return join(this.home, "registry.json");
  }

  private async load(): Promise<{ text: string | undefined; data: Data }> {
    let text: string | undefined;
    try {
      text = await readFile(this.path, "utf8");
    } catch (error: any) {
      if (error?.code === "ENOENT") return { text: undefined, data: empty() };
      throw new RegistryError(`The task registry cannot be read: ${error?.message ?? error}`);
    }
    try {
      const data = JSON.parse(text);
      if (data?.version !== 1 || typeof data.projects !== "object" || typeof data.tasks !== "object") throw new Error();
      return { text, data };
    } catch {
      throw new RegistryError(`The task registry ${this.path} is not valid; it was left unchanged.`);
    }
  }

  async read(): Promise<Data> {
    return (await this.load()).data;
  }

  /**
   * Apply a change: read, change a copy, write a temporary file, and rename it over the registry only if the file did
   * not change meanwhile. A change by another session is re-read and the operation applied once more; a second
   * conflict is reported rather than retried.
   */
  async update<T>(change: (data: Data) => T | Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { text, data } = await this.load();
      const result = await change(data);
      await mkdir(this.home, { recursive: true });
      const temporary = `${this.path}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      const now = await readFile(this.path, "utf8").catch(() => undefined);
      if (now !== text) {
        await unlink(temporary).catch(() => {});
        continue;
      }
      await rename(temporary, this.path);
      return result;
    }
    throw new RegistryError("The task registry kept changing under another session; nothing was written. Try again.");
  }

  /** The repository root for a directory: its Git top level, or the directory itself outside Git. */
  async repoRoot(cwd: string): Promise<string> {
    try {
      return resolve((await run("git", ["-C", cwd, "rev-parse", "--show-toplevel"])).stdout.trim());
    } catch {
      return resolve(cwd);
    }
  }

  async projectFor(cwd: string): Promise<{ slug: string; project: Project } | undefined> {
    const root = await this.repoRoot(cwd);
    const data = await this.read();
    for (const [slug, project] of Object.entries(data.projects))
      if (project.repos.some((repo) => root === repo || root.startsWith(repo + sep))) return { slug, project };
    return undefined;
  }

  async createProject(name: string, cwd: string): Promise<string> {
    const slug = slugify(name);
    const root = await this.repoRoot(cwd);
    const store = join(this.home, "projects", slug);
    await mkdir(store, { recursive: true });
    await this.update((data) => {
      if (data.projects[slug]) throw new RegistryError(`A project named ${slug} already exists.`);
      for (const project of Object.values(data.projects) as Project[])
        if (project.repos.includes(root)) throw new RegistryError(`${root} is already linked to ${project.name}.`);
      data.projects[slug] = { name, store, repos: [root] };
    });
    return slug;
  }

  async linkProject(name: string, cwd: string): Promise<string> {
    const slug = slugify(name);
    const root = await this.repoRoot(cwd);
    await this.update((data) => {
      const project = data.projects[slug];
      if (!project) throw new RegistryError(`No project named ${name}.`);
      for (const [other, entry] of Object.entries(data.projects))
        if (other !== slug && entry.repos.includes(root))
          throw new RegistryError(`${root} is already linked to ${entry.name}.`);
      if (!project.repos.includes(root)) data.projects[slug] = { ...project, repos: [...project.repos, root] };
    });
    return slug;
  }

  /** Create a record in the project's store with Track Work's init, then register it. */
  async createTask(
    slug: string,
    title: string,
    goal: string,
    parent?: string,
  ): Promise<{ id: string; record: string }> {
    const data = await this.read();
    const project = data.projects[slug];
    if (!project) throw new RegistryError(`No project ${slug}.`);
    const lines = [`### Goal`, `- ${goal}`];
    if (parent) {
      const parentTask = data.tasks[parent];
      if (!parentTask) throw new RegistryError(`No task ${parent}.`);
      if (parentTask.parent) throw new RegistryError(`${parent} is a child; a child has no children.`);
      lines.push("", "### What defines this task", `- Child of ${parent} (${parentTask.record}).`);
    }
    lines.push("", "### Next useful action", "- Start the work.", "");
    const script = join(this.packageRoot, "skills", "track-work", "scripts", "working-record.mjs");
    const child = execFile(process.execPath, [
      script,
      "init",
      "--root",
      project.store,
      "--name",
      title,
      "--input",
      "-",
    ]);
    const output = new Promise<string>((done, fail) => {
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk) => (stdout += chunk));
      child.stderr?.on("data", (chunk) => (stderr += chunk));
      child.on("close", (code) => (code === 0 ? done(stdout.trim()) : fail(new RegistryError(stderr.trim()))));
    });
    child.stdin?.end(lines.join("\n"));
    const record = resolve(await output);
    const id = `${slug}/${basename(dirname(record)).match(/^task-\d+/)?.[0]}`;
    await this.update((next) => {
      next.tasks[id] = { record, project: slug, title, ...(parent ? { parent } : {}) };
    });
    return { id, record };
  }

  /** Move an unregistered record's task directory into a project store and register it. */
  async importRecord(slug: string, record: string): Promise<{ id: string; record: string }> {
    const data = await this.read();
    const project = data.projects[slug];
    if (!project) throw new RegistryError(`No project ${slug}.`);
    if (Object.values(data.tasks).some((task) => task.record === record))
      throw new RegistryError(`${record} is already registered.`);
    const tasks = join(project.store, ".freeflow", "tasks");
    await mkdir(tasks, { recursive: true });
    const numbers = (await readdir(tasks)).map((name) => Number(/^task-(\d+)/.exec(name)?.[1] ?? 0));
    const number = String(Math.max(0, ...numbers) + 1).padStart(3, "0");
    const source = dirname(record);
    const name = basename(source).replace(/^task-\d+/, `task-${number}`);
    const target = join(tasks, name);
    try {
      await rename(source, target);
    } catch (error: any) {
      if (error?.code !== "EXDEV") throw error;
      await cp(source, target, { recursive: true, errorOnExist: true });
      await rm(source, { recursive: true });
    }
    const moved = join(target, "record.md");
    const title = /^# Working Record:\s*(.+?)\s*$/m.exec(await readFile(moved, "utf8"))?.[1] ?? name;
    const id = `${slug}/task-${number}`;
    await this.update((next) => {
      next.tasks[id] = { record: moved, project: slug, title };
    });
    return { id, record: moved };
  }

  async task(id: string): Promise<RegisteredTask | undefined> {
    return (await this.read()).tasks[id];
  }

  async byRecord(record: string): Promise<{ id: string; task: RegisteredTask } | undefined> {
    const entry = Object.entries((await this.read()).tasks).find(([, task]) => task.record === record);
    return entry ? { id: entry[0], task: entry[1] } : undefined;
  }

  async children(id: string): Promise<{ id: string; task: RegisteredTask }[]> {
    return Object.entries((await this.read()).tasks)
      .filter(([, task]) => task.parent === id)
      .map(([childId, task]) => ({ id: childId, task }));
  }

  async projectTasks(slug: string): Promise<{ id: string; task: RegisteredTask }[]> {
    return Object.entries((await this.read()).tasks)
      .filter(([, task]) => task.project === slug)
      .map(([id, task]) => ({ id, task }));
  }

  /**
   * Make this session the record's owner. Returns the other owner instead when one holds it and takeover is false;
   * the check and the change happen in one registry update, so two sessions cannot both become owner.
   */
  async own(id: string, owner: Owner, takeover: boolean): Promise<{ owned: true } | { owned: false; by: Owner }> {
    return this.update((data) => {
      const task = data.tasks[id];
      if (!task) throw new RegistryError(`No task ${id}.`);
      if (task.owner && task.owner.session !== owner.session && !takeover)
        return { owned: false as const, by: task.owner };
      data.tasks[id] = { ...task, owner };
      return { owned: true as const };
    });
  }

  async release(id: string, session: string): Promise<void> {
    const task = await this.task(id);
    if (task?.owner?.session !== session) return;
    await this.update((data) => {
      const current = data.tasks[id];
      if (current?.owner?.session !== session) return;
      const { owner: _owner, ...rest } = current;
      data.tasks[id] = rest;
    });
  }
}
