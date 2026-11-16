import { isMainModule, runSafely, runSessionStartAdapter } from "../shared/runtime-context.mjs";

export function main() {
  runSessionStartAdapter({
    eventNames: ["SessionStart"],
    getWorkspaceCwd: (input) => input.cwd || process.cwd(),
    harness: "claude-code",
    formatOutput: ({ eventName, additionalContext }) => ({
      hookSpecificOutput: {
        hookEventName: eventName,
        additionalContext,
      },
    }),
  });
}

if (isMainModule(import.meta.url)) runSafely(main);
