import { isMainModule, runSafely, runSessionStartAdapter } from "../shared/runtime-context.mjs";

export function main() {
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
