// Freeflow's Tool Execution tools in a subject's container, end to end with no model: the installed Pi loads the
// guard, this repository's Freeflow extension and the container route, a local scripted model calls each tool, and a
// real container engine runs the commands. It is skipped without docker, a local image, Pi or Freeflow's built
// extension, or when the engine cannot see the temp folder (on Colima, set TMPDIR under your home folder).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { baseProcessEnvironment } from "../../../skills/evaluate-behavior/scripts/lib/process.mjs";
import {
  containerTarget,
  missingContainerPrerequisites,
  startContainer,
} from "../../../skills/evaluate-behavior/scripts/lib/container.mjs";
import { prepareIsolation } from "../../../skills/evaluate-behavior/scripts/lib/hosts/pi/isolation.mjs";
import {
  containerRouteExtensionPath,
  guardExtensionPath,
} from "../../../skills/evaluate-behavior/scripts/lib/hosts/pi/process.mjs";
import { runRpcBodySession } from "../../../skills/evaluate-behavior/scripts/lib/hosts/pi/rpc.mjs";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const freeflowEntry = path.join(repositoryRoot, "pi-extension", "freeflow", "index.js");
const TOOLS = ["read", "bash", "bash_background", "monitor", "stop_background", "apply_patch"];
const PROVIDER = "skill-eval-probe";
const MODEL = "scripted";
// Counts the background sleeper's process in the container, without procps: every process's command line from /proc.
const COUNT_SLEEPERS = `for p in /proc/[0-9]*; do tr '\\0' ' ' < "$p/cmdline" 2>/dev/null; echo; done | grep -c '^[s]leep 4242' || true`;

function localImage() {
  if (spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" }).status !== 0) {
    return { skip: "docker is not installed or its daemon is not running" };
  }
  for (const name of ["busybox", "alpine", "mirror.gcr.io/library/ubuntu:24.04", "ubuntu:24.04", "debian:bookworm"]) {
    const inspected = spawnSync("docker", ["image", "inspect", "--format", "{{.Id}}", name], { encoding: "utf8" });
    if (inspected.status === 0) return { image: inspected.stdout.trim() };
  }
  return { skip: "no busybox, alpine, ubuntu or debian image is present locally, and the tests never pull one" };
}

async function prerequisites() {
  const image = localImage();
  if (image.skip) return image;
  if (spawnSync("pi", ["--version"]).status !== 0) return { skip: "pi is not installed" };
  try {
    await access(path.join(repositoryRoot, "node_modules", "@earendil-works", "pi-coding-agent"));
    await access(freeflowEntry);
  } catch {
    return { skip: "Freeflow's extension or its dependencies are not installed (npm ci)" };
  }
  const missing = await missingContainerPrerequisites(
    { image: image.image, workdir: "/testbed", network: "none" },
    null,
    await realpath(tmpdir()),
  );
  if (missing.length > 0)
    return { skip: `the container engine is not ready: ${missing[0].name} (${missing[0].found})` };
  return image;
}

const ready = await prerequisites();

/**
 * A local OpenAI-compatible endpoint that plays the scripted model: each request gets the first scripted tool call
 * whose result the conversation does not hold yet, built from the results so far, and a short reply once all have
 * run (to a notice, too). It records every request's messages.
 */
function startScriptedModel(steps) {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const parsed = JSON.parse(body || "{}");
      const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
      requests.push(messages);
      const results = new Map();
      for (const message of messages) {
        if (message?.role !== "tool") continue;
        const content = Array.isArray(message.content)
          ? message.content.map((part) => part?.text ?? "").join("")
          : String(message.content ?? "");
        results.set(message.tool_call_id, content);
      }
      const next = steps.find((step) => !results.has(step.id));
      const delta = next
        ? {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                index: 0,
                id: next.id,
                type: "function",
                function: { name: next.tool, arguments: JSON.stringify(next.args(results)) },
              },
            ],
          }
        : { role: "assistant", content: "Noted." };
      const finish = next ? "tool_calls" : "stop";
      const base = { id: "scripted", created: 0, model: MODEL, object: "chat.completion.chunk" };
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      const send = (chunk) => response.write(`data: ${JSON.stringify({ ...base, ...chunk })}\n\n`);
      send({ choices: [{ index: 0, delta, finish_reason: null }] });
      send({ choices: [{ index: 0, delta: {}, finish_reason: finish }] });
      send({ choices: [], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } });
      response.end("data: [DONE]\n\n");
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({
        requests,
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      }),
    );
  });
}

const started = (results) => {
  const text = results.get("start") ?? "";
  const match = /ID (\S+)\. Output: (\S+?)\.? You will/.exec(text);
  assert.ok(match, `bash_background did not start: ${text}`);
  return { id: match[1], output: match[2] };
};

test(
  "Freeflow's background commands, monitors and patches run confined in a real container, driven through Pi",
  { skip: ready.skip ?? false, timeout: 180_000 },
  async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-tool-execution-")));
    let container = null;
    let model = null;
    try {
      const workspace = path.join(root, "workspace");
      await mkdir(path.join(workspace, ".freeflow"), { recursive: true });
      await writeFile(
        path.join(workspace, ".freeflow", "config.json"),
        `${JSON.stringify({ cognitiveRouting: { enabled: false }, toolExecution: { enabled: true } })}\n`,
      );
      const isolation = await prepareIsolation(root, null, { settings: { retry: { enabled: false } } });
      const temporary = isolation.environment.TMPDIR;
      const steps = [
        {
          id: "start",
          tool: "bash_background",
          args: () => ({ command: "echo ready; exec sleep 4242", description: "sleeper" }),
        },
        {
          id: "running",
          tool: "bash",
          args: (results) => ({ command: `sleep 1; cat '${started(results).output}'; ${COUNT_SLEEPERS}` }),
        },
        { id: "read-output", tool: "read", args: (results) => ({ path: started(results).output }) },
        { id: "stop", tool: "stop_background", args: (results) => ({ id: started(results).id }) },
        { id: "stopped", tool: "bash", args: () => ({ command: COUNT_SLEEPERS }) },
        {
          id: "patch-inside",
          tool: "apply_patch",
          args: () => ({ input: "*** Begin Patch\n*** Add File: notes/a.txt\n+patched\n*** End Patch" }),
        },
        {
          id: "patch-outside",
          tool: "apply_patch",
          args: () => ({ input: "*** Begin Patch\n*** Add File: ../escape.txt\n+escaped\n*** End Patch" }),
        },
        { id: "patched", tool: "bash", args: () => ({ command: "cat notes/a.txt" }) },
        {
          id: "watch",
          tool: "monitor",
          args: () => ({
            command: "for i in 1 2 3; do echo line$i; sleep 0.3; done",
            description: "three lines",
            timeout_ms: 20_000,
          }),
        },
        // Exits after this run has ended: its notice starts a run of its own while no prompt is in flight.
        { id: "late", tool: "bash_background", args: () => ({ command: "sleep 2; echo late", description: "late" }) },
      ];
      model = await startScriptedModel(steps);
      await writeFile(
        path.join(isolation.evidence.root, "agent", "models.json"),
        `${JSON.stringify({ providers: { [PROVIDER]: { baseUrl: model.baseUrl, api: "openai-completions", apiKey: "scripted", models: [{ id: MODEL }] } } })}\n`,
      );
      const image = ready.image;
      container = await startContainer({
        container: { image, workdir: "/testbed", network: "none" },
        workspace,
        resources: [temporary],
      });
      const environment = {
        ...baseProcessEnvironment(),
        PI_SKIP_VERSION_CHECK: "1",
        PI_TELEMETRY: "0",
        PWD: await realpath(workspace),
        SKILL_EVAL_ALLOWED_ROOTS: JSON.stringify([await realpath(workspace), temporary]),
        SKILL_EVAL_WRITABLE_ROOT: workspace,
        SKILL_EVAL_ALLOWED_TOOLS: JSON.stringify(TOOLS),
        SKILL_EVAL_CONTEXT_MANIFEST: "",
        SKILL_EVAL_HOST: "pi",
        SKILL_EVAL_PROMPT_MODE: "host",
        SKILL_EVAL_SHELL: JSON.stringify({
          isolation: "container",
          network: "none",
          workspace: "/testbed",
          container: { image, workdir: "/testbed", network: "none" },
        }),
        SKILL_EVAL_CONTAINER: containerTarget(container),
        ...isolation.environment,
      };
      const args = [
        "--mode",
        "rpc",
        "--no-session",
        "--no-extensions",
        "--extension",
        guardExtensionPath(),
        "--extension",
        freeflowEntry,
        "--extension",
        containerRouteExtensionPath(),
        "--no-skills",
        "--no-prompt-templates",
        "--no-themes",
        "--no-context-files",
        "--no-approve",
        "--tools",
        TOOLS.join(","),
        "--model",
        `${PROVIDER}/${MODEL}`,
      ];
      let replies = 0;
      const observation = await runRpcBodySession({
        command: "pi",
        args,
        cwd: workspace,
        eventsFile: path.join(root, "events.jsonl"),
        stderrFile: path.join(root, "stderr.log"),
        environment,
        settings: { retry: { enabled: false }, compaction: { enabled: false } },
        prompts: ["Run the checks."],
        // The user takes a few seconds to reply, so the late command's exit notice arrives while Pi is idle.
        nextPrompt: async () => {
          replies += 1;
          if (replies > 1) return null;
          await new Promise((resolve) => setTimeout(resolve, 4000));
          return "And now?";
        },
      });
      const stderr = await readFile(path.join(root, "stderr.log"), "utf8");
      assert.deepEqual(observation.protocolErrors, [], stderr);
      assert.equal(observation.settled, true, stderr);

      const last = model.requests.at(-1);
      const results = new Map(
        model.requests
          .flat()
          .filter((message) => message?.role === "tool")
          .map((message) => [
            message.tool_call_id,
            Array.isArray(message.content) ? message.content.map((part) => part?.text ?? "").join("") : message.content,
          ]),
      );
      // The background command ran in the container, its output file was readable from the container's bash and
      // with read, and stopping it on the host ended its process in the container.
      assert.match(results.get("running"), /^ready\n1\n?$/m, results.get("running"));
      assert.match(results.get("read-output"), /ready/);
      assert.match(results.get("stop"), /Stopped/);
      assert.equal(results.get("stopped").trim(), "0");
      // A patch wrote inside the workspace, where the container sees it; one that names a path outside was refused.
      assert.match(results.get("patch-inside"), /Success/);
      assert.equal(await readFile(path.join(workspace, "notes", "a.txt"), "utf8"), "patched\n");
      assert.match(results.get("patched"), /patched/);
      assert.match(results.get("patch-outside"), /apply_patch path escapes the evaluation environment/);
      await assert.rejects(access(path.join(root, "escape.txt")));
      // The monitor's lines reached the model as notices.
      assert.ok(
        model.requests.some((messages) => JSON.stringify(messages).includes("line1")),
        "no monitor event reached the model",
      );
      // The late command's exit notice started a run between the turns; it joined the first turn.
      assert.ok(observation.turns[0].unpromptedRuns >= 1, JSON.stringify(observation.turns[0], null, 2));
      assert.ok(JSON.stringify(last).includes("And now?"));
      assert.equal(observation.turns.length, 2);
    } finally {
      await container?.remove();
      await model?.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);
