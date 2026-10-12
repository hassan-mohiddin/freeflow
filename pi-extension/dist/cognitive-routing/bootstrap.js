import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
/** The packaged skill and its markers, or undefined when it cannot be read: then nothing is gated on it. */
export function findRoutingSkill(packageRoots) {
  for (const root of packageRoots) {
    const path = join(root, "capabilities", "cognitive-routing", "SKILL.md");
    if (!existsSync(path)) continue;
    try {
      const lines = readFileSync(path, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      // The frontmatter's name line, and the closing rule: together they show the whole body was read.
      const first = lines.find((line) => line.startsWith("name:"));
      const last = lines.at(-1);
      if (first && last && first !== last) return { path, first, last };
    } catch {}
  }
  return undefined;
}
const holds = new WeakMap();
/** Whether a prepared view holds a complete read of the skill. Renderings are shared across requests, so each is checked once. */
export function viewHoldsSkill(messages, skill) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "toolResult" || typeof message !== "object") continue;
    let held = holds.get(message);
    if (held === undefined) {
      const text = Array.isArray(message.content)
        ? message.content.map((block) => (block?.type === "text" ? block.text : "")).join("\n")
        : String(message.content ?? "");
      const found = text.includes(skill.first) && text.includes(skill.last);
      holds.set(message, found);
      held = found;
    }
    if (held) return true;
  }
  return false;
}
