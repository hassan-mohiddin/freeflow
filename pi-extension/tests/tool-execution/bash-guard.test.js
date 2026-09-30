import assert from "node:assert/strict";
import test from "node:test";
import { backgroundRefusal } from "../../dist/tool-execution/bash-guard.js";

test("a trailing & or a long foreground sleep is refused; ordinary commands are not", () => {
  for (const command of ["npm run dev &", "nohup python server.py > log 2>&1 &  ", "(cd app && serve) &"])
    assert.match(backgroundRefusal(command), /^A command ending in & keeps running after this call/, command);
  for (const [command, seconds] of [
    ["sleep 30", 30],
    ["npm start; sleep 12 && curl localhost:3000", 12],
    ["while true; do date; sleep 1m; done", 60],
    ["if ready; then sleep 10.5; fi", 10.5],
  ])
    assert.match(
      backgroundRefusal(command),
      new RegExp(`^A foreground sleep of ${seconds} s holds the session\\.`),
      command,
    );
  for (const command of [
    "a && b",
    "cmd 2>&1 | tail -40",
    "cmd &>/dev/null",
    "until curl -s localhost:3000; do sleep 1; done",
    "sleep 2 && ls",
    "python -c 'import time; time.sleep(30)'",
    "echo done & wait",
  ])
    assert.equal(backgroundRefusal(command), undefined, command);
});
