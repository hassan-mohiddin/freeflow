import { isMainModule, runSafely, runSessionStartAdapter } from "../shared/runtime-context.mjs";

// Claude Code reads this hooks file too, from the plugin's root beside the hooks its manifest names, and runs it with
// CLAUDE_PLUGIN_ROOT set; Gemini sets GEMINI_PROJECT_DIR and never CLAUDE_PLUGIN_ROOT. Claude Code's own adapter
// delivers its context, so here this one stays silent.
const isClaudeCode = (env = process.env) => Boolean(env.CLAUDE_PLUGIN_ROOT) && !env.GEMINI_PROJECT_DIR;

export function main() {
  if (isClaudeCode()) return;
  runSessionStartAdapter({
    eventNames: ["SessionStart"],
    getWorkspaceCwd: (input) => input.cwd || process.cwd(),
    formatOutput: ({ additionalContext }) => ({
      hookSpecificOutput: {
        additionalContext,
      },
    }),
  });
}

if (isMainModule(import.meta.url)) runSafely(main);
