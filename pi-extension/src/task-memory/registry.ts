import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The task registry, as Pi sees it: a typed facade over Track Work's portable registry
 * (`skills/track-work/scripts/lib/registry.mjs`), which owns the file, the project stores, task IDs, parents and
 * owners on every host. Pi adds only what needs a harness: attaching, delivery, the write gate and takeover prompts.
 */
export type Owner = Readonly<{ session: string; file?: string; since: string }>;
export type RegisteredTask = Readonly<{
  record: string;
  project: string;
  title: string;
  parent?: string;
  owner?: Owner;
}>;
export type Project = Readonly<{ name: string; store: string; repos: readonly string[] }>;
type Entry = { id: string; task: RegisteredTask };

/** The Freeflow home, read synchronously for the write gate; the library resolves it the same way. */
export function freeflowHome(): string {
  return process.env.FREEFLOW_HOME || join(homedir(), ".freeflow");
}

export class Registry {
  private impl: Promise<any> | undefined;

  constructor(
    private readonly packageRoot: string,
    private readonly home = freeflowHome(),
  ) {}

  // Loaded on first use, so the extension never touches Track Work's library while task memory is unused.
  private async call<T>(name: string, ...args: unknown[]): Promise<T> {
    this.impl ??= import(pathToFileURL(join(this.packageRoot, "skills/track-work/scripts/lib/registry.mjs")).href).then(
      (lib) => new lib.Registry(this.home),
    );
    return (await this.impl)[name](...args);
  }

  read(): Promise<{ version: 1; projects: Record<string, Project>; tasks: Record<string, RegisteredTask> }> {
    return this.call("read");
  }
  update<T>(change: (data: any) => T | Promise<T>): Promise<T> {
    return this.call("update", change);
  }
  repoRoot(cwd: string): Promise<string> {
    return this.call("repoRoot", cwd);
  }
  projectFor(cwd: string): Promise<{ slug: string; project: Project } | undefined> {
    return this.call("projectFor", cwd);
  }
  createProject(name: string, cwd: string): Promise<string> {
    return this.call("createProject", name, cwd);
  }
  linkProject(name: string, cwd: string): Promise<string> {
    return this.call("linkProject", name, cwd);
  }
  createTask(slug: string, title: string, goal: string, parent?: string): Promise<{ id: string; record: string }> {
    return this.call("createTask", slug, title, goal, parent);
  }
  importRecord(projectName: string, record: string): Promise<{ id: string; record: string }> {
    return this.call("importRecord", projectName, record);
  }
  task(id: string): Promise<RegisteredTask | undefined> {
    return this.call("task", id);
  }
  byRecord(record: string): Promise<Entry | undefined> {
    return this.call("byRecord", record);
  }
  children(id: string): Promise<Entry[]> {
    return this.call("children", id);
  }
  projectTasks(slug: string): Promise<Entry[]> {
    return this.call("projectTasks", slug);
  }
  own(id: string, owner: Owner, takeover: boolean): Promise<{ owned: true } | { owned: false; by: Owner }> {
    return this.call("own", id, owner, takeover);
  }
  release(id: string, session: string): Promise<void> {
    return this.call("release", id, session);
  }
  scope(id: string, scope: string): Promise<[string, string][]> {
    return this.call("scope", id, scope);
  }
}
