import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { response } from "../fixtures/routing-native.js";

test(
  "bundled Pi CLI loads Freeflow adapter and changes effort inside a native tool loop",
  { timeout: 30000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "astra-cli-")),
      agentDir = join(root, "agent");
    try {
      await mkdir(agentDir);
      await writeFile(
        join(agentDir, "auth.json"),
        JSON.stringify({ openai: { type: "api_key", key: "fixture-not-real" } }),
      );
      await writeFile(
        join(agentDir, "settings.json"),
        JSON.stringify({
          defaultProvider: "openai",
          defaultModel: "gpt-6-astra",
          defaultThinkingLevel: "low",
          transport: "sse",
          compaction: { enabled: false },
          retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } },
        }),
      );
      const capture = join(root, "requests.json"),
        extension = join(root, "fixture.mjs");
      await writeFile(
        extension,
        `import {writeFileSync} from 'node:fs';\n${response.toString()}\nexport default function(pi){pi.registerTool({name:'probe_raise_effort',label:'Probe effort',description:'Fixture only',parameters:{type:'object',properties:{}},execute:async()=>{pi.setThinkingLevel('high');return {content:[{type:'text',text:'Changed desired effort.'}]};}});const bodies=[];globalThis.fetch=async(url,init)=>{if(String(url)!=='https://api.openai.com/v1/responses')throw Error('Unexpected network');const body=JSON.parse(String(init.body));bodies.push(body);writeFileSync(${JSON.stringify(capture)},JSON.stringify(bodies));if(bodies.length>2)throw Error('Unexpected extra request');return response(bodies.length,bodies.length===1?[{name:'probe_raise_effort',args:{}}]:[],'OK');};}`,
      );
      const cli = fileURLToPath(new URL("./bundle/cli.js", import.meta.resolve("@earendil-works/pi-coding-agent")));
      const entry = fileURLToPath(new URL("../../freeflow/index.js", import.meta.url));
      const child = spawn(
        process.execPath,
        [
          cli,
          "-p",
          "--mode",
          "json",
          "--no-extensions",
          "--no-skills",
          "--no-context-files",
          "--no-prompt-templates",
          "--no-themes",
          "-e",
          extension,
          "-e",
          entry,
          "Run the effort fixture.",
        ],
        {
          cwd: root,
          env: {
            PATH: process.env.PATH,
            PI_CODING_AGENT_DIR: agentDir,
            PI_OFFLINE: "1",
            PI_TELEMETRY: "0",
            PI_SKIP_VERSION_CHECK: "1",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      child.stdout.on("data", (d) => (output += d));
      child.stderr.on("data", (d) => (output += d));
      const timer = setTimeout(() => child.kill("SIGKILL"), 20000);
      const code = await new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("close", resolve);
      });
      clearTimeout(timer);
      assert.equal(code, 0, output.slice(-4000));
      const bodies = JSON.parse(await readFile(capture, "utf8"));
      assert.equal(bodies.length, 2);
      assert.equal(bodies[1].reasoning.effort, "low");
      const updates = bodies[1].input.filter((i) => i.type === "configuration_update");
      assert.deepEqual(updates, [{ type: "configuration_update", reasoning: { effort: "high" } }]);
      assert.ok(bodies[1].input.some((i) => i.type === "function_call_output"));
      assert.match(output, /OK/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
