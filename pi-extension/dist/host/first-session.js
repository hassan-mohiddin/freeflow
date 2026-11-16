import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
/**
 * The line that reaches the agent once per user, at the first session (D-060, N1): what Freeflow does here and where its
 * guide is. It is written once, by the first session that gives it, as the marker the shared renderer also reads
 * (first-session.json in the Freeflow home). Null when the line was given before, or when the marker cannot be written.
 */
export function firstSessionLine(home, guide) {
  const marker = join(home, "first-session.json");
  if (existsSync(marker)) return null;
  try {
    mkdirSync(home, { recursive: true });
    writeFileSync(marker, `${JSON.stringify({ at: new Date().toISOString() })}\n`, "utf8");
  } catch {
    return null;
  }
  return `Freeflow is installed and on in every folder with its defaults: no setup is needed. Your settings and rules are kept in the Freeflow home (${home}). The guide is ${guide}; settings are \`/freeflow settings\` on Pi.`;
}
