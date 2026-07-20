#!/usr/bin/env node

const commands = new Set(["init", "validate", "inspect"]);
const [command] = process.argv.slice(2);

function printUsage() {
  process.stdout.write(
    `Usage: skill-author <init|validate|inspect> [options]\n\nCommands:\n  init      Create a minimal skill package\n  validate  Validate skill structure and resources\n  inspect   Report a factual package inventory\n`,
  );
}

if (!command || command === "--help" || command === "-h") {
  printUsage();
} else if (!commands.has(command)) {
  process.stderr.write(`Unknown command: ${command}\n`);
  process.exitCode = 2;
} else {
  process.stderr.write(`skill-author ${command} is not implemented in the fresh baseline\n`);
  process.exitCode = 1;
}
