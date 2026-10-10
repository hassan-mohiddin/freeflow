import { execFile as execFileCallback } from "node:child_process";
import { copyFile, cp, mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { slugify } from "./format.mjs";
import { STORE_MARKER, taskRoot } from "./store.mjs";

/**
 * The task registry: projects, registered tasks, their parents, and which session owns each record. One JSON file
 * under the Freeflow home (FREEFLOW_HOME, default ~/.freeflow), shared by every session on every host. Each project
 * keeps its records in a store under the home, created by this script's own init, so a registered record is an
 * ordinary Working Record. The registry is canonical for membership, parentage and ownership; records are canonical
 * for task content.
 */
const execFile = promisify(execFileCallback);
const SCRIPT = fileURLToPath(new URL("../working-record.mjs", import.meta.url));

export const TASK_ID = /^[a-z0-9-]+\/task-\d+$/;

export class RegistryError extends Error {
  constructor(message) {
    super(message);
    this.name = "RegistryError";
  }
}

export function freeflowHome() {
  return process.env.FREEFLOW_HOME || join(homedir(), ".freeflow");
}

export function projectSlug(name) {
  return slugify(name).slice(0, 48) || "project";
}

const empty = () => ({ version: 1, projects: {}, tasks: {} });

export class Registry {
  constructor(home = freeflowHome()) {
    this.home = home;
  }

  get path() {
    return join(this.home, "registry.json");
  }

  async load() {
    let text;
    try {
      text = await readFile(this.path, "utf8");
    } catch (error) {
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

  async read() {
    return (await this.load()).data;
  }

  /**
   * Apply a change: read, change a copy, write a temporary file, and rename it over the registry only if the file did
   * not change meanwhile. A change by another session is re-read and the operation applied once more; a second
   * conflict is reported rather than retried. The check and the rename are two steps, so a write landing between them
   * is lost; the window is small and accepted.
   */
  async update(change) {
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
  async repoRoot(cwd) {
    try {
      return resolve((await execFile("git", ["-C", cwd, "rev-parse", "--show-toplevel"])).stdout.trim());
    } catch {
      return resolve(cwd);
    }
  }

  async projectFor(cwd) {
    const root = await this.repoRoot(cwd);
    const data = await this.read();
    for (const [slug, project] of Object.entries(data.projects))
      if (project.repos.some((repo) => root === repo || root.startsWith(repo + sep))) return { slug, project };
    return undefined;
  }

  /** Create a project and link the repository containing cwd; worktrees is where its children's worktrees go. */
  async createProject(name, cwd, worktrees) {
    const slug = projectSlug(name);
    const root = await this.repoRoot(cwd);
    const store = join(this.home, "projects", slug);
    await mkdir(store, { recursive: true });
    // Marks the directory as a project store, so Track Work keeps its records in tasks/ rather than .freeflow/tasks/.
    await writeFile(join(store, STORE_MARKER), `${JSON.stringify({ version: 1, project: slug })}\n`, {
      flag: "wx",
    }).catch((error) => {
      if (error?.code !== "EEXIST") throw error;
    });
    await this.update((data) => {
      if (data.projects[slug]) throw new RegistryError(`A project named ${slug} already exists.`);
      for (const project of Object.values(data.projects))
        if (project.repos.includes(root)) throw new RegistryError(`${root} is already linked to ${project.name}.`);
      data.projects[slug] = { name, store, repos: [root], ...(worktrees ? { worktrees: resolve(worktrees) } : {}) };
    });
    return slug;
  }

  async linkProject(name, cwd, worktrees) {
    const slug = projectSlug(name);
    const root = await this.repoRoot(cwd);
    await this.update((data) => {
      const project = data.projects[slug];
      if (!project) throw new RegistryError(`No project named ${name}.`);
      for (const [other, entry] of Object.entries(data.projects))
        if (other !== slug && entry.repos.includes(root))
          throw new RegistryError(`${root} is already linked to ${entry.name}.`);
      data.projects[slug] = {
        ...project,
        repos: project.repos.includes(root) ? project.repos : [...project.repos, root],
        ...(worktrees ? { worktrees: resolve(worktrees) } : {}),
      };
    });
    return slug;
  }

  /** Create a record in the project's store with this script's init, then register it; primary is its directory. */
  async createTask(slug, title, goal, parent, primary) {
    const data = await this.read();
    const project = data.projects[slug];
    if (!project) throw new RegistryError(`No project ${slug}.`);
    const lines = ["### Goal", `- ${goal}`];
    if (parent) {
      const parentTask = data.tasks[parent];
      if (!parentTask) throw new RegistryError(`No task ${parent}.`);
      if (parentTask.parent) throw new RegistryError(`${parent} is a child; a child has no children.`);
      lines.push("", "### What defines this task", `- Child of ${parent} (${parentTask.record}).`);
    }
    lines.push("", "### Next useful action", "- Start the work.", "");
    const child = execFileCallback(process.execPath, [
      SCRIPT,
      "init",
      "--root",
      project.store,
      "--name",
      title,
      "--input",
      "-",
    ]);
    const output = new Promise((done, fail) => {
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
      next.tasks[id] = {
        record,
        project: slug,
        title,
        ...(parent ? { parent } : {}),
        ...(primary ? { environment: { primary: resolve(primary), directories: [] } } : {}),
      };
    });
    return { id, record };
  }

  /** Move an unregistered record's task directory into a project store, with the next free number, and register it. */
  async importRecord(projectName, record) {
    const slug = projectSlug(projectName);
    const data = await this.read();
    const project = data.projects[slug];
    if (!project) throw new RegistryError(`No project ${projectName}.`);
    if (Object.values(data.tasks).some((task) => task.record === record))
      throw new RegistryError(`${record} is already registered.`);
    const tasks = taskRoot(project.store);
    await mkdir(tasks, { recursive: true });
    const numbers = (await readdir(tasks)).map((name) => Number(/^task-(\d+)/.exec(name)?.[1] ?? 0));
    const number = String(Math.max(0, ...numbers) + 1).padStart(3, "0");
    const source = dirname(record);
    const target = join(tasks, basename(source).replace(/^task-\d+/, `task-${number}`));
    try {
      await rename(source, target);
    } catch (error) {
      if (error?.code !== "EXDEV") throw error;
      await cp(source, target, { recursive: true, errorOnExist: true });
      await rm(source, { recursive: true });
    }
    const moved = join(target, "record.md");
    const title = /^# Working Record:\s*(.+?)\s*$/m.exec(await readFile(moved, "utf8"))?.[1] ?? basename(target);
    const id = `${slug}/task-${number}`;
    await this.update((next) => {
      next.tasks[id] = { record: moved, project: slug, title };
    });
    return { id, record: moved };
  }

  async task(id) {
    return (await this.read()).tasks[id];
  }

  async byRecord(record) {
    const entry = Object.entries((await this.read()).tasks).find(([, task]) => task.record === record);
    return entry ? { id: entry[0], task: entry[1] } : undefined;
  }

  async children(id) {
    return Object.entries((await this.read()).tasks)
      .filter(([, task]) => task.parent === id)
      .map(([childId, task]) => ({ id: childId, task }));
  }

  async projectTasks(slug) {
    return Object.entries((await this.read()).tasks)
      .filter(([, task]) => task.project === slug)
      .map(([id, task]) => ({ id, task }));
  }

  /**
   * Make a session the record's owner. Returns the other owner instead when one holds it and takeover is false; the
   * check and the change happen in one registry update, so two sessions cannot both become owner.
   */
  async own(id, owner, takeover) {
    return this.update((data) => {
      const task = data.tasks[id];
      if (!task) throw new RegistryError(`No task ${id}.`);
      if (task.owner && task.owner.session !== owner.session && !takeover) return { owned: false, by: task.owner };
      data.tasks[id] = { ...task, owner };
      return { owned: true };
    });
  }

  async release(id, session) {
    const task = await this.task(id);
    if (task?.owner?.session !== session) return;
    await this.update((data) => {
      const current = data.tasks[id];
      if (current?.owner?.session !== session) return;
      const { owner: _owner, ...rest } = current;
      data.tasks[id] = rest;
    });
  }

  /** Change where a task's work happens: its primary directory, and additional directories. */
  async setEnvironment(id, { primary, add, remove } = {}) {
    return this.update((data) => {
      const task = data.tasks[id];
      if (!task) throw new RegistryError(`No task ${id}.`);
      const environment = {
        primary: task.environment?.primary,
        directories: [...(task.environment?.directories ?? [])],
      };
      if (primary) environment.primary = resolve(primary);
      if (add && !environment.directories.includes(resolve(add))) environment.directories.push(resolve(add));
      if (remove) environment.directories = environment.directories.filter((dir) => dir !== resolve(remove));
      data.tasks[id] = { ...task, environment };
      return environment;
    });
  }

  /** A task's environment with what Git says about its primary directory now; branches are read, never stored. */
  async environment(id) {
    const task = await this.task(id);
    if (!task) throw new RegistryError(`No task ${id}.`);
    const primary = task.environment?.primary;
    const directories = task.environment?.directories ?? [];
    if (!primary) return { primary: undefined, directories };
    const exists = await stat(primary)
      .then((info) => info.isDirectory())
      .catch(() => false);
    if (!exists) return { primary, directories, exists: false };
    const git = async (...args) =>
      (await execFile("git", ["-C", primary, ...args]).catch(() => ({ stdout: "" }))).stdout.trim();
    const branch = (await git("branch", "--show-current")) || undefined;
    const worktree = (await git("rev-parse", "--git-dir")) !== (await git("rev-parse", "--git-common-dir"));
    return { primary, directories, exists: true, branch, worktree };
  }

  /** Registered tasks whose primary directory contains cwd, deepest first. */
  async here(cwd) {
    const where = resolve(cwd);
    return Object.entries((await this.read()).tasks)
      .filter(([, task]) => {
        const primary = task.environment?.primary;
        return primary && (where === primary || where.startsWith(primary + sep));
      })
      .sort(([, a], [, b]) => b.environment.primary.length - a.environment.primary.length)
      .map(([id, task]) => ({ id, task }));
  }

  /**
   * Fan a task out into a child: create the child record, a Git worktree on a new branch for it, copy the parent
   * repository's personal Freeflow config when the worktree has none, and make the worktree the child's directory.
   * If the worktree cannot be created, the child stays registered with no environment and the error says so.
   */
  async fanout(parent, title, goal, { path, base, cwd } = {}) {
    const parentTask = await this.task(parent);
    if (!parentTask) throw new RegistryError(`No task ${parent}.`);
    const project = (await this.read()).projects[parentTask.project];
    const repo = await this.repoRoot(parentTask.environment?.primary ?? cwd ?? process.cwd());
    const created = await this.createTask(parentTask.project, title, goal, parent);
    const directory = basename(dirname(created.record));
    const childSlug = directory.replace(/^task-\d+-/, "");
    const branch = `${parentTask.project}/${directory}`;
    const target = resolve(path ?? join(project.worktrees ?? dirname(repo), `${basename(repo)}-${childSlug}`));
    try {
      await execFile("git", ["-C", repo, "worktree", "add", "-b", branch, target, base ?? "HEAD"]);
    } catch (error) {
      const reason = String(error?.stderr || error?.message || error).trim();
      return {
        ...created,
        branch,
        error: `The child ${created.id} is registered, but its worktree was not created: ${reason}`,
      };
    }
    const local = join(repo, ".freeflow", "local.json");
    const copied = join(target, ".freeflow", "local.json");
    const hasLocal = await stat(local)
      .then(() => true)
      .catch(() => false);
    const hasCopy = await stat(copied)
      .then(() => true)
      .catch(() => false);
    if (hasLocal && !hasCopy) {
      await mkdir(dirname(copied), { recursive: true });
      await copyFile(local, copied);
    }
    await this.setEnvironment(created.id, { primary: target });
    return { ...created, path: target, branch, copiedConfig: hasLocal && !hasCopy };
  }

  /** The records a search covers: one task, a task's tree (its root and the root's children), or a project. */
  async scope(id, scope) {
    const task = await this.task(id);
    if (!task) throw new RegistryError(`No task ${id}.`);
    if (scope === "task") return [[id, task.record]];
    if (scope === "tree") {
      const root = task.parent ?? id;
      const rootTask = await this.task(root);
      return [
        ...(rootTask ? [[root, rootTask.record]] : []),
        ...(await this.children(root)).map((child) => [child.id, child.task.record]),
      ];
    }
    if (scope === "project")
      return (await this.projectTasks(task.project)).map((entry) => [entry.id, entry.task.record]);
    throw new RegistryError("scope must be task, tree or project.");
  }
}
