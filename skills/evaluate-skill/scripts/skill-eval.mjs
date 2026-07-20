#!/usr/bin/env node

const commands = new Set(["run", "view"]);
const [command] = process.argv.slice(2);

function printUsage() {
  process.stdout.write(
    `Usage: skill-eval <run|view> <suite-or-result> [options]\n\nCommands:\n  run <suite-or-group>   Run selected evaluation groups\n  view <result-id>       Render selected stored evidence\n\nSelectors:\n  --group <id-or-position>\n  --variant <baseline|candidate>\n`,
  );
}

if (!command || command === "--help" || command === "-h") {
  printUsage();
} else if (!commands.has(command)) {
  process.stderr.write(`Unknown command: ${command}\n`);
  process.exitCode = 2;
} else {
  process.stderr.write(`skill-eval ${command} is not implemented in the fresh baseline\n`);
  process.exitCode = 1;
}
