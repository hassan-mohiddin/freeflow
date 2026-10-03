import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_PLUGINS_SCHEMA, validateAgentPluginManifest, validateHostManifests } from "./check-host-manifests.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("live host manifests share one package identity and the 25-skill kernel", () => {
  assert.deepEqual(validateHostManifests(repoRoot).errors, []);
});

test("Agent Plugins 1.0 manifest rejects component path fields", () => {
  const errors = validateAgentPluginManifest({
    $schema: AGENT_PLUGINS_SCHEMA,
    name: "freeflow",
    skills: "./skills/",
  });
  assert.match(errors.join("\n"), /unsupported top-level field: skills/);
});

test("Agent Plugins 1.0 manifest rejects invalid plugin names and schemas", () => {
  const errors = validateAgentPluginManifest({
    $schema: "https://agent-plugins.org/schemas/0.9.0/plugin.schema.json",
    name: "Freeflow",
  });
  assert.match(errors.join("\n"), /\$schema/);
  assert.match(errors.join("\n"), /lowercase plugin-name/);
});

test("OpenCode uses the canonical skill source without a second tree", () => {
  const config = JSON.parse(readFileSync(resolve(repoRoot, "opencode.json"), "utf8"));
  assert.deepEqual(config.skills, ["./skills"]);
  assert.equal(Object.prototype.hasOwnProperty.call(config.skills, "paths"), false);
  assert.equal(existsSync(resolve(repoRoot, ".opencode/skills")), false);
});

test("Gemini SessionStart uses the optional matcher-free lifecycle configuration", () => {
  const config = JSON.parse(readFileSync(resolve(repoRoot, "hooks/hooks.json"), "utf8"));
  const sessionStart = config.hooks.SessionStart;
  assert.equal(sessionStart.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(sessionStart[0], "matcher"), false);
});

test("Hermes uses the portable Agent Plugins package rather than a native Python plugin", () => {
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, "plugin.json"), "utf8"));
  assert.equal(manifest.$schema, AGENT_PLUGINS_SCHEMA);
  assert.equal(existsSync(resolve(repoRoot, "plugin.yaml")), false);
  assert.equal(existsSync(resolve(repoRoot, "__init__.py")), false);
});
