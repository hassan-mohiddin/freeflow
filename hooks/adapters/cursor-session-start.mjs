import { isMainModule, runSafely, runSessionStartAdapter } from "../shared/runtime-context.mjs";

export function main() {
  runSessionStartAdapter({
    eventNames: ["sessionStart", "SessionStart"],
    getWorkspaceCwd: (input) => input.workspace_roots?.[0] || input.cwd || process.cwd(),
    formatOutput: ({ additionalContext }) => ({
      additional_context: additionalContext,
    }),
  });
}

if (isMainModule(import.meta.url)) runSafely(main);
