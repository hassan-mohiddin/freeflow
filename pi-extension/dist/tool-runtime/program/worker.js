import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { QuickJSRunner } from "./quickjs.js";
import { hostFrame } from "./protocol.js";
if (isMainThread || !parentPort) throw new Error("Freeflow program worker must run in a Worker thread.");
const setup = workerData;
const send = (frame) => parentPort.postMessage(frame);
const runner = new QuickJSRunner(setup, send);
parentPort.on("message", (value) => {
  try {
    const frame = hostFrame(value);
    if (frame.runId !== setup.runId) return;
    if (frame.type === "reply") runner.reply(frame);
    else runner.cancel();
  } catch {
    runner.cancel();
  }
});
try {
  const terminal = await runner.run();
  send(
    terminal.type === "finished"
      ? { v: 1, type: "finished", runId: setup.runId, detached: terminal.detached }
      : {
          v: 1,
          type: "failed",
          runId: setup.runId,
          code: terminal.code,
          message: terminal.message.slice(0, 2000),
          detached: terminal.detached,
        },
  );
} catch (error) {
  send({
    v: 1,
    type: "failed",
    runId: setup.runId,
    code: "engine_unavailable",
    message: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
    detached: false,
  });
} finally {
  parentPort.close();
}
