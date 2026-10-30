import { execFile as execFileCallback } from "node:child_process";
import { realpathSync } from "node:fs";
import {
  appendFile,
  copyFile,
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { slugify } from "./format.mjs";
import { LAST_TASK_NUMBER, nextTaskNumber, STORE_MARKER, taskRoot } from "./store.mjs";

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

/** A directory as the user wrote it, with a leading ~ meaning the home directory (commands typed in an agent are not
 * expanded by a shell). */
export function directory(path) {
  return resolve(path === "~" ? homedir() : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path);
}

const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;

/**
 * The command a user pastes into a new terminal to start an agent in a child's worktree: cd there, keep a
 * non-default Freeflow home, and run the agent's command (pi, claude, codex, ...).
 */
export function startCommand(path, agent) {
  const home = process.env.FREEFLOW_HOME;
  const keepHome =
    home && resolve(home) !== join(homedir(), ".freeflow") ? `FREEFLOW_HOME=${quote(resolve(home))} ` : "";
  return `cd ${quote(path)}${agent ? ` && ${keepHome}${agent}` : ""}`;
}

const empty = () => ({ version: 1, projects: {}, tasks: {} });

/** A removal's result for the agent and the user: what went, where it is, what was left and how to remove it. */
export function removalText(result, trash) {
  const ids = result.tasks.map((task) => task.id);
  const what = result.project
    ? `project ${result.project.name} (${result.project.slug})${ids.length ? ` and its tasks ${ids.join(", ")}` : ""}`
    : ids.length > 1
      ? `${ids[0]} and its children ${ids.slice(1).join(", ")}`
      : ids[0];
  const lines = [
    `Removed ${what}. ${result.trash.length ? `The records are in the trash: ${result.trash.join(", ")}.` : "There were no record files to move."} Only the user empties the trash (${trash}).`,
  ];
  if (result.unlinked?.length) lines.push(`Project links removed: ${result.unlinked.join(", ")}.`);
  if (result.worktrees.length)
    lines.push(
      "Git worktrees and branches were left in place. To remove them, run from the main repository:",
      ...result.worktrees.map(
        (worktree) =>
          `- ${worktree.id}: git worktree remove ${quote(worktree.path)}${worktree.branch ? ` && git branch -D ${quote(worktree.branch)}` : ""}`,
      ),
    );
  return lines.join("\n");
}

/** A path with its symlinks resolved, or as given when it does not exist. */
function real(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/**
 * The project link (Task 004 D-003): a symlink in each repository linked to a project, and in its children's worktrees,
 * to the project's store, so the user can browse and edit its records in the editor. Agents address records by task ID
 * or real path.
 */
export const PROJECT_LINK = ".freeflow/project";

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

  /** A project by name or slug. */
  async project(name) {
    const slug = projectSlug(name);
    const project = (await this.read()).projects[slug];
    return project ? { slug, project } : undefined;
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
      data.projects[slug] = { name, store, repos: [root], ...(worktrees ? { worktrees: directory(worktrees) } : {}) };
    });
    // A project removed under this name keeps its task numbers retired, so its old IDs never name new tasks.
    const retired = (await this.read()).retired?.[slug];
    if (retired) {
      const tasks = taskRoot(store);
      await mkdir(tasks, { recursive: true });
      const marker = join(tasks, LAST_TASK_NUMBER);
      const recorded = Number((await readFile(marker, "utf8").catch(() => "0")).trim()) || 0;
      if (retired > recorded) await writeFile(marker, `${retired}\n`);
    }
    await this.linkStore(root, store);
    return slug;
  }

  async linkProject(name, cwd, worktrees) {
    const slug = projectSlug(name);
    const root = await this.repoRoot(cwd);
    const store = await this.update((data) => {
      const project = data.projects[slug];
      if (!project) throw new RegistryError(`No project named ${name}.`);
      for (const [other, entry] of Object.entries(data.projects))
        if (other !== slug && entry.repos.includes(root))
          throw new RegistryError(`${root} is already linked to ${entry.name}.`);
      data.projects[slug] = {
        ...project,
        repos: project.repos.includes(root) ? project.repos : [...project.repos, root],
        ...(worktrees ? { worktrees: directory(worktrees) } : {}),
      };
      return project.store;
    });
    await this.linkStore(root, store);
    return slug;
  }

  /**
   * Make the project link in a directory and keep it out of Git through the clone's info/exclude, not a shared
   * .gitignore. A link to the store is kept, a link elsewhere replaced, and anything else at that path left alone.
   * Where no link can be made (Windows without the right to make one), the result says why; the store's real path
   * still works.
   */
  async linkStore(dir, store) {
    const link = join(dir, PROJECT_LINK);
    let existing;
    try {
      existing = await lstat(link);
    } catch (error) {
      if (error?.code !== "ENOENT") return { link, error: String(error?.message ?? error) };
    }
    if (existing && !existing.isSymbolicLink()) return { link, error: `${link} is not a link; it was left alone.` };
    try {
      if (existing && real(await readlink(link)) === real(store)) return { link };
      if (existing) await unlink(link);
      await mkdir(dirname(link), { recursive: true });
      // A junction on Windows needs no extra right; other systems ignore the type.
      await symlink(store, link, "junction");
    } catch (error) {
      return { link, error: `The project link was not made: ${error?.message ?? error}` };
    }
    try {
      await execFile("git", ["-C", dir, "check-ignore", "-q", "--", PROJECT_LINK]);
    } catch (error) {
      // Exit 1: not ignored. Any other failure (not a Git repository, no Git) leaves nothing to ignore it from.
      if (error?.code !== 1) return { link };
      try {
        const where = (await execFile("git", ["-C", dir, "rev-parse", "--git-path", "info/exclude"])).stdout.trim();
        const exclude = resolve(dir, where);
        await mkdir(dirname(exclude), { recursive: true });
        const text = await readFile(exclude, "utf8").catch(() => "");
        await appendFile(exclude, `${text && !text.endsWith("\n") ? "\n" : ""}/${PROJECT_LINK}\n`);
      } catch (failure) {
        return { link, error: `The project link is not ignored by Git: ${failure?.message ?? failure}` };
      }
    }
    return { link };
  }

  /**
   * The project link for the repository containing cwd, made if missing, when it belongs to a project: linked to it, or
   * a registered task's directory (a child's worktree). Undefined when it belongs to none.
   */
  async linkHere(cwd) {
    const data = await this.read();
    const project = (await this.projectFor(cwd))?.project ?? data.projects[(await this.here(cwd))[0]?.task.project];
    return project ? this.linkStore(await this.repoRoot(cwd), project.store) : undefined;
  }

  /**
   * Create a Schema 4 record in the project's store with this script's init (Pi's Task Memory reads Schema 4 until Pi
   * moves to Schema 5), then register it; primary is its directory.
   */
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
    lines.push("", "### Next useful action", "- Agree the first step with the user.", "");
    const child = execFileCallback(process.execPath, [
      SCRIPT,
      "init",
      "--schema",
      "4",
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
      if (next.tasks[id]) throw new RegistryError(`${id} is already registered.`);
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
    const source = dirname(record);
    // Only a Track Work task directory moves: anything else could take unrelated files with it.
    if (!/^task-\d{3,}-[a-z0-9][a-z0-9-]*$/.test(basename(source)))
      throw new RegistryError(
        `${record} is not in a Track Work task directory (task-NNN-name), so it cannot be imported.`,
      );
    const tasks = taskRoot(project.store);
    await mkdir(tasks, { recursive: true });
    const number = String(await nextTaskNumber(tasks)).padStart(3, "0");
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
      if (next.tasks[id]) throw new RegistryError(`${id} is already registered.`);
      next.tasks[id] = { record: moved, project: slug, title };
    });
    return { id, record: moved };
  }

  async task(id) {
    return (await this.read()).tasks[id];
  }

  async byRecord(record) {
    // The same file by another path (through the project link, or a symlinked home) is the same record.
    const tasks = Object.entries((await this.read()).tasks);
    const target = real(record);
    const entry =
      tasks.find(([, task]) => task.record === record) ?? tasks.find(([, task]) => real(task.record) === target);
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
      if (primary) environment.primary = directory(primary);
      if (add && !environment.directories.includes(directory(add))) environment.directories.push(directory(add));
      if (remove) environment.directories = environment.directories.filter((dir) => dir !== directory(remove));
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

  /** Where removed tasks and projects go; only the user empties it (Task 006). */
  get trash() {
    return join(this.home, "trash");
  }

  /**
   * What removing a task, or a project, would take: the tasks (a task with its children, or all of a project's), their
   * owners, and the Git worktrees fan-out made for them, which removal leaves in place.
   */
  async removal({ task: id, project: name } = {}) {
    const data = await this.read();
    let project;
    let entries;
    if (name !== undefined) {
      const found = await this.project(name);
      if (!found) throw new RegistryError(`No project named ${name}.`);
      project = found;
      entries = Object.entries(data.tasks).filter(([, task]) => task.project === found.slug);
    } else {
      const task = data.tasks[id];
      if (!task) throw new RegistryError(`No task ${id}.`);
      entries = [[id, task], ...Object.entries(data.tasks).filter(([, other]) => other.parent === id)];
    }
    const worktrees = [];
    for (const [taskId] of entries) {
      const environment = await this.environment(taskId).catch(() => undefined);
      if (environment?.worktree && environment.primary)
        worktrees.push({ id: taskId, path: environment.primary, branch: environment.branch });
    }
    return {
      ...(project ? { project: { slug: project.slug, name: project.project.name } } : {}),
      tasks: entries.map(([taskId, task]) => ({ id: taskId, title: task.title, owner: task.owner?.session })),
      worktrees,
    };
  }

  /** Move a directory into the trash under a dated name; the trash is in the Freeflow home, so this is a rename. */
  async toTrash(path, name) {
    await mkdir(this.trash, { recursive: true });
    const target = join(this.trash, `${new Date().toISOString().replace(/[:.]/g, "-")}-${name}`);
    await rename(path, target);
    return target;
  }

  /**
   * Remove a registered task and its children: their task directories move to the trash and their registry entries go.
   * Task numbers are never reused, so an old ID cannot come to name a new task. Worktrees and branches stay.
   */
  async removeTask(id) {
    const plan = await this.removal({ task: id });
    const data = await this.read();
    // Keep the highest removed number, so the store never hands it out again.
    const tasksDirectory = dirname(dirname(data.tasks[id].record));
    const numbers = plan.tasks.map(({ id: taskId }) => Number(/task-(\d+)$/.exec(taskId)?.[1] ?? 0));
    const marker = join(tasksDirectory, LAST_TASK_NUMBER);
    const recorded = Number((await readFile(marker, "utf8").catch(() => "0")).trim()) || 0;
    await writeFile(marker, `${Math.max(recorded, ...numbers)}\n`);
    const moved = [];
    for (const { id: taskId } of plan.tasks) {
      const directory = dirname(data.tasks[taskId].record);
      const there = await stat(directory)
        .then(() => true)
        .catch(() => false);
      if (there)
        moved.push([await this.toTrash(directory, `${data.tasks[taskId].project}-${basename(directory)}`), directory]);
    }
    try {
      await this.update((current) => {
        for (const { id: taskId } of plan.tasks) delete current.tasks[taskId];
      });
    } catch (error) {
      for (const [trashed, directory] of moved) await rename(trashed, directory).catch(() => {});
      throw error;
    }
    return { ...plan, trash: moved.map(([trashed]) => trashed) };
  }

  /**
   * Remove a project: its store (every task's record) moves to the trash, the project and its tasks leave the registry,
   * and the project links in its repositories and children's worktrees go. Worktrees and branches stay.
   */
  async removeProject(name) {
    const plan = await this.removal({ project: name });
    const { slug } = plan.project;
    const project = (await this.read()).projects[slug];
    const marker = join(taskRoot(project.store), LAST_TASK_NUMBER);
    const highest = Math.max(
      Number((await readFile(marker, "utf8").catch(() => "0")).trim()) || 0,
      ...plan.tasks.map(({ id }) => Number(/task-(\d+)$/.exec(id)?.[1] ?? 0)),
    );
    const trashed = await this.toTrash(project.store, `project-${slug}`);
    try {
      await this.update((current) => {
        if (highest) current.retired = { ...current.retired, [slug]: Math.max(current.retired?.[slug] ?? 0, highest) };
        delete current.projects[slug];
        for (const { id } of plan.tasks) delete current.tasks[id];
      });
    } catch (error) {
      await rename(trashed, project.store).catch(() => {});
      throw error;
    }
    const unlinked = [];
    for (const directory of [...project.repos, ...plan.worktrees.map((worktree) => worktree.path)]) {
      const link = join(directory, PROJECT_LINK);
      const target = await readlink(link).catch(() => undefined);
      if (target !== undefined && resolve(directory, target) === resolve(project.store)) {
        await unlink(link).catch(() => {});
        unlinked.push(link);
      }
    }
    return { ...plan, trash: [trashed], unlinked };
  }

  /** What the trash holds, oldest first. */
  async trashEntries() {
    return (await readdir(this.trash).catch(() => [])).sort();
  }

  /** Delete everything in the trash. Only the user's own command calls this; agents never do (Task 006). */
  async emptyTrash() {
    const entries = await this.trashEntries();
    await rm(this.trash, { recursive: true, force: true });
    return entries;
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
    const taskDirectory = basename(dirname(created.record));
    const childSlug = taskDirectory.replace(/^task-\d+-/, "");
    const branch = `${parentTask.project}/${taskDirectory}`;
    const target = path ? directory(path) : join(project.worktrees ?? dirname(repo), `${basename(repo)}-${childSlug}`);
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
    await this.linkStore(target, project.store);
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
