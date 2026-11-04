// A Freeflow arm on Claude Code (SPEC-011 4.2), with a stand-in Claude Code and a scripted endpoint: the arm gets
// the built package as its plugin and a fresh Freeflow store of its own; the plain arm gets neither. No model runs.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import { freeflowEvents } from "../../../skills/evaluate-behavior/scripts/lib/subject.mjs";
import { validityProblems } from "../../../skills/evaluate-behavior/scripts/lib/validity.mjs";
import { claudeStarts, installFakeClaude, startScriptedApi } from "./helpers/fake-claude.mjs";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-behavior/scripts/skill-eval.mjs", import.meta.url));
const trackWork = fileURLToPath(new URL("../../../skills/track-work", import.meta.url));
const AMBIENT = ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"];

async function withTempDirectory(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-claude-freeflow-")));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function write(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, typeof contents === "string" ? contents : `${JSON.stringify(contents, null, 2)}\n`);
  return file;
}

// A stand-in for scripts/freeflow-snapshot.mjs: the package layout the evaluator checks, and Track Work's real
// script, which makes the arm's store.
async function installFakeSnapshot(root) {
  await cp(trackWork, path.join(root, "track-work-source"), { recursive: true });
  await write(
    path.join(root, "scripts", "freeflow-snapshot.mjs"),
    `import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const target = option("--target");
mkdirSync(path.join(target, "pi-extension", "freeflow"), { recursive: true });
mkdirSync(path.join(target, "pi-extension", "dist", "host"), { recursive: true });
writeFileSync(path.join(target, "pi-extension", "freeflow", "index.js"), "export default () => {};\\n");
writeFileSync(path.join(target, "pi-extension", "dist", "host", "config-validation.js"),
  "export function validateRepositoryConfig() { return null; }\\nexport function validateLocalConfig() { return null; }\\n");
cpSync(${JSON.stringify(path.join(root, "track-work-source"))}, path.join(target, "skills", "track-work"), { recursive: true });
writeFileSync(option("--metadata"), JSON.stringify({ sourceCommit: "${"c".repeat(40)}", packageName: "freeflow", packageVersion: "0.0.0-test" }));
`,
  );
}

function group() {
  return {
    schema_version: 2,
    kind: "group",
    id: "claude-freeflow",
    type: "body",
    input: { prompt: "Write hello.txt." },
    fixture: null,
    tools: ["read", "write"],
    configuration: {
      host: { name: "claude-code" },
      model: { model: "anthropic/claude-haiku-5-5", thinking: "xhigh" },
      subject: { kind: "none" },
      runtime: { prompt: "host" },
      freeflow: { source: { kind: "git", ref: "HEAD" }, repository: {} },
    },
    arms: { plain: { freeflow: null }, freeflow: {} },
    reference: "plain",
    component: ["freeflow"],
    expectations: ["plain", "freeflow"].map((arm) => ({
      id: `${arm}-hello`,
      kind: "path",
      variant: arm,
      path: "hello.txt",
      expect: "exists",
    })),
    review_questions: [],
  };
}

function runCli(root, bins, args, environment) {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !AMBIENT.includes(key)));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [entrypoint, ...args, "--jobs", "1"], {
      cwd: root,
      env: {
        ...inherited,
        PATH: [...bins, process.env.PATH ?? ""].join(path.delimiter),
        SKILL_EVAL_CREDENTIALS_DIR: path.join(root, "no-credentials"),
        ...environment,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("a Freeflow configuration loads on Claude Code; the host prompt is still required", async () => {
  await withTempDirectory(async (root) => {
    const loaded = await loadDefinition(await write(path.join(root, "group.json"), group()), { root });
    assert.equal(loaded.host, "claude-code");
    assert.equal(loaded.variants.plain.freeflow ?? null, null);
    assert.deepEqual(loaded.variants.freeflow.freeflow.source, { kind: "git", ref: "HEAD" });
    const isolated = group();
    isolated.configuration.runtime.prompt = "isolated";
    await assert.rejects(
      loadDefinition(await write(path.join(root, "isolated.json"), isolated), { root }),
      /freeflow needs configuration.runtime.prompt "host"/,
    );
  });
});

test("the Freeflow arm runs claude -p with the package as its plugin and a fresh store; the plain arm with neither", async () => {
  await withTempDirectory(async (root) => {
    await installFakeSnapshot(root);
    const claude = await installFakeClaude(root);
    const api = await startScriptedApi((body) =>
      body.messages.at(-1)?.content?.[0]?.type === "tool_result"
        ? [{ type: "text", text: "Wrote it." }]
        : [{ type: "tool_use", id: "toolu_write", name: "Write", input: { file_path: "hello.txt", content: "hi" } }],
    );
    try {
      const definition = await write(path.join(root, "group.json"), group());
      const result = await runCli(root, [claude.bin], ["run", definition, "--uncommitted"], {
        CLAUDE_CODE_OAUTH_TOKEN: "test-token",
        ANTHROPIC_BASE_URL: api.url,
      });
      const directory = path.join(result.stdout.match(/^Path: (.+)$/m)?.[1] ?? "", "groups", "claude-freeflow");
      const starts = await claudeStarts(claude.log);
      const byArm = (arm) => starts.find((start) => start.cwd.startsWith(path.join(directory, arm)));
      const plain = byArm("plain");
      const freeflow = byArm("freeflow");
      assert.ok(plain && freeflow, result.stdout + result.stderr);

      // The plain arm: Claude Code's own config only, no plugin, no store.
      assert.equal(plain.args.includes("--plugin-dir"), false);
      assert.equal(plain.env.FREEFLOW_HOME, null);
      assert.equal(plain.env.SKILL_EVAL_WRITABLE_ROOTS, null);

      // The Freeflow arm: the built package as the plugin, and FREEFLOW_HOME at a store Track Work made in its folder.
      const plugin = freeflow.args[freeflow.args.indexOf("--plugin-dir") + 1];
      assert.equal(plugin, path.join(directory, "resources", "freeflow", "0", "package"));
      assert.ok(existsSync(path.join(plugin, "skills", "track-work", "scripts", "working-record.mjs")));
      const home = path.join(directory, "freeflow", "freeflow-home");
      assert.equal(freeflow.env.FREEFLOW_HOME, home);
      assert.deepEqual(JSON.parse(freeflow.env.SKILL_EVAL_WRITABLE_ROOTS), [home]);
      assert.equal(JSON.parse(await readFile(path.join(home, "store.json"), "utf8")).kind, "freeflow-store");
      // Both arms still run with the evaluator's guard and settings, and no settings from anywhere else.
      for (const start of [plain, freeflow]) {
        assert.equal(start.args[start.args.indexOf("--setting-sources") + 1], "");
        assert.ok(start.args.includes("--settings"));
      }

      // The stand-in loads no plugin, so the arm wrote no event log: it is invalid, never counted as plain (section 5).
      const plainRun = JSON.parse(await readFile(path.join(directory, "plain", "run.json"), "utf8"));
      const freeflowRun = JSON.parse(await readFile(path.join(directory, "freeflow", "run.json"), "utf8"));
      assert.equal(plainRun.state, "complete", JSON.stringify(plainRun.error));
      assert.equal(plainRun.freeflowEvents, undefined);
      assert.equal(freeflowRun.state, "invalid");
      assert.match(freeflowRun.error.message, /no Freeflow event log/);
      assert.deepEqual(freeflowRun.freeflowEvents, {
        required: true,
        home: "freeflow-home",
        logs: [],
        lines: 0,
        summary: null,
      });
    } finally {
      await api.close();
    }
  });
});

test("a Freeflow arm's event log is read into its run: the summary, its overhead, and a run with lines is valid", async () => {
  await withTempDirectory(async (root) => {
    const home = path.join(root, "freeflow-home");
    const line = (seq, fields) => ({
      v: 1,
      ts: `2026-11-04T10:00:0${seq}.000Z`,
      seq,
      session: "sess-1",
      harness: "claude-code",
      agent: "main",
      ...fields,
    });
    await write(
      path.join(home, "events", "sess-1.jsonl"),
      `${[
        line(1, { kind: "freeflow", what: "guidance", chars: 400 }),
        line(2, { kind: "model.request", turn: 1, model: "claude-haiku-5-5", in: 10, cacheWrite: 390, out: 5 }),
      ]
        .map((each) => JSON.stringify(each))
        .join("\n")}\n`,
    );
    const events = freeflowEvents(home, root);
    assert.deepEqual(
      [events.home, events.logs, events.lines],
      ["freeflow-home", ["freeflow-home/events/sess-1.jsonl"], 2],
    );
    // The guidance's 100 tokens of the request's 400 new ones.
    assert.equal(events.summary.overhead.share, 0.25);
    assert.equal(events.summary.modelRequests, 1);
    const run = {
      state: "complete",
      transcript: [{ role: "assistant" }],
      usage: { input: 1, output: 1 },
      response: "done",
      freeflowEvents: events,
    };
    assert.deepEqual(validityProblems(run), []);
  });
});
