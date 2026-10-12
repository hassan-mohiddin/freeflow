import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The routing skill's bootstrap read, made mechanical. Under automatic control a profile must read the complete
 * cognitive-routing skill before its first command or edit; the always-loaded prompt said so, but Haiku 5.5
 * Coordinators skipped the read and ran commands themselves in executor mode, and after a compaction neither profile
 * re-read it (Task 008 S-005). A read counts when a tool result in the profile's own view holds the skill's first and
 * last lines, by any tool: `read`, a codemode script, or `cat`.
 */
export interface RoutingSkill {
  path: string;
  first: string;
  last: string;
}

/** The packaged skill and its markers, or undefined when it cannot be read: then nothing is gated on it. */
export function findRoutingSkill(packageRoots: readonly string[]): RoutingSkill | undefined {
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

const holds = new WeakMap<object, boolean>();

/** Whether a prepared view holds a complete read of the skill. Renderings are shared across requests, so each is checked once. */
export function viewHoldsSkill(messages: readonly any[], skill: RoutingSkill): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "toolResult" || typeof message !== "object") continue;
    let held = holds.get(message);
    if (held === undefined) {
      const text = Array.isArray(message.content)
        ? message.content.map((block: any) => (block?.type === "text" ? block.text : "")).join("\n")
        : String(message.content ?? "");
      const found = text.includes(skill.first) && text.includes(skill.last);
      holds.set(message, found);
      held = found;
    }
    if (held) return true;
  }
  return false;
}
