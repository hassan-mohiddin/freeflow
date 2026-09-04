import { isMainModule, runSafely, runSessionStartAdapter } from "../shared/runtime-context.mjs";

export function main() {
  runSessionStartAdapter({
    eventNames: ["SessionStart"],
    getWorkspaceCwd: (input) => input.cwd || process.cwd(),
    formatOutput: ({ additionalContext }) => ({
      additionalContext,
    }),
  });
}

if (isMainModule(import.meta.url)) runSafely(main);
