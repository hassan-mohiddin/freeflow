import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
/** The Freeflow home, read synchronously for the write gate; the library resolves it the same way. */
export function freeflowHome() {
  return process.env.FREEFLOW_HOME || join(homedir(), ".freeflow");
}
export class Registry {
  packageRoot;
  home;
  impl;
  constructor(packageRoot, home = freeflowHome()) {
    this.packageRoot = packageRoot;
    this.home = home;
  }
  // Loaded on first use, so the extension never touches Track Work's library while task memory is unused.
  async call(name, ...args) {
    this.impl ??= import(pathToFileURL(join(this.packageRoot, "skills/track-work/scripts/lib/registry.mjs")).href).then(
      (lib) => new lib.Registry(this.home),
    );
    return (await this.impl)[name](...args);
  }
  read() {
    return this.call("read");
  }
  update(change) {
    return this.call("update", change);
  }
  repoRoot(cwd) {
    return this.call("repoRoot", cwd);
  }
  projectFor(cwd) {
    return this.call("projectFor", cwd);
  }
  project(name) {
    return this.call("project", name);
  }
  /** The command a user pastes into a new terminal to start an agent in a directory (see Track Work's library). */
  async startCommand(path, agent) {
    const lib = await import(pathToFileURL(join(this.packageRoot, "skills/track-work/scripts/lib/registry.mjs")).href);
    return lib.startCommand(path, agent);
  }
  createProject(name, cwd, worktrees) {
    return this.call("createProject", name, cwd, worktrees);
  }
  linkProject(name, cwd, worktrees) {
    return this.call("linkProject", name, cwd, worktrees);
  }
  createTask(slug, title, goal, parent, primary) {
    return this.call("createTask", slug, title, goal, parent, primary);
  }
  importRecord(projectName, record) {
    return this.call("importRecord", projectName, record);
  }
  task(id) {
    return this.call("task", id);
  }
  byRecord(record) {
    return this.call("byRecord", record);
  }
  children(id) {
    return this.call("children", id);
  }
  projectTasks(slug) {
    return this.call("projectTasks", slug);
  }
  own(id, owner, takeover) {
    return this.call("own", id, owner, takeover);
  }
  release(id, session) {
    return this.call("release", id, session);
  }
  setEnvironment(id, change) {
    return this.call("setEnvironment", id, change);
  }
  environment(id) {
    return this.call("environment", id);
  }
  /** The project link for cwd's repository, made if missing; undefined when it belongs to no project (Task 004 D-003). */
  linkHere(cwd) {
    return this.call("linkHere", cwd);
  }
  here(cwd) {
    return this.call("here", cwd);
  }
  fanout(parent, title, goal, options) {
    return this.call("fanout", parent, title, goal, options);
  }
  scope(id, scope) {
    return this.call("scope", id, scope);
  }
}
