import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const ROLE_REFERENCES = { coordinator: "coordinator.md", worker: "worker.md" };
function lines(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
/** A reference and its markers: its heading and its closing line. */
function reference(path) {
  if (!existsSync(path)) return undefined;
  try {
    const text = lines(path);
    const first = text[0],
      last = text.at(-1);
    return first && last && first !== last ? { path, first, last } : undefined;
  } catch {
    return undefined;
  }
}
/** The packaged skill, its role references and their markers, or undefined when the skill cannot be read: then nothing is gated on it. */
export function findRoutingSkill(packageRoots) {
  for (const root of packageRoots) {
    const dir = join(root, "capabilities", "cognitive-routing");
    const path = join(dir, "SKILL.md");
    if (!existsSync(path)) continue;
    try {
      const text = lines(path);
      // The frontmatter's name line, and the closing rule: together they show the whole body was read.
      const first = text.find((line) => line.startsWith("name:"));
      const last = text.at(-1);
      if (!first || !last || first === last) continue;
      const roles = {};
      for (const role of Object.keys(ROLE_REFERENCES)) {
        const found = reference(join(dir, "references", ROLE_REFERENCES[role]));
        if (found) roles[role] = found;
      }
      return { path, first, last, roles };
    } catch {}
  }
  return undefined;
}
/** The role reference a view's profile needs; `solo` needs none. */
export function routingRole(view) {
  if (view === "coordinator") return "coordinator";
  if (view === "helper" || view === "executor") return "worker";
  return undefined;
}
const SKILL = 1,
  COORDINATOR = 2,
  WORKER = 4;
const ROLE_BIT = { coordinator: COORDINATOR, worker: WORKER };
/** Which files each tool result holds, per skill. Renderings are shared across requests, so each is checked once. */
const holds = new WeakMap();
function holdsFile(file, text) {
  return !!file && text.includes(file.first) && text.includes(file.last);
}
/** Whether a prepared view holds a complete read of the skill and of the reference for the view's profile. */
export function viewHoldsSkill(messages, skill, view) {
  const role = routingRole(view);
  const need = SKILL | (role && skill.roles[role] ? ROLE_BIT[role] : 0);
  let cache = holds.get(skill);
  if (!cache) holds.set(skill, (cache = new WeakMap()));
  let found = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "toolResult" || typeof message !== "object") continue;
    let bits = cache.get(message);
    if (bits === undefined) {
      const text = Array.isArray(message.content)
        ? message.content.map((block) => (block?.type === "text" ? block.text : "")).join("\n")
        : String(message.content ?? "");
      bits =
        (holdsFile(skill, text) ? SKILL : 0) |
        (holdsFile(skill.roles.coordinator, text) ? COORDINATOR : 0) |
        (holdsFile(skill.roles.worker, text) ? WORKER : 0);
      cache.set(message, bits);
    }
    found |= bits;
    if ((found & need) === need) return true;
  }
  return false;
}
/** The files a profile must have in view before its commands or edits: the skill, then its role's reference. */
export function requiredReads(skill, view) {
  const role = routingRole(view);
  const ref = role ? skill.roles[role] : undefined;
  return ref ? [skill.path, ref.path] : [skill.path];
}
