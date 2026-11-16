// Task memory's default on Pi (D-060, round 3): unset in every layer, sync when the store has a remote and local
// without one; an explicit value wins. The store is the Freeflow home, so the remote is read from its Git config.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { defaultValueFor, storeHasRemote } from "../../dist/host/config-store.js";
import { settingSpec } from "../../dist/host/config-validation.js";
import { readCapabilityState } from "../../dist/host/config.js";

/** A Freeflow home holding a Git repository, with an origin remote when asked. */
async function home({ remote, settings }) {
  const folder = await mkdtemp(join(tmpdir(), "freeflow-pi-memory-home-"));
  await mkdir(join(folder, ".git"), { recursive: true });
  const config = remote
    ? '[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = https://example.invalid/store.git\n'
    : "[core]\n";
  await writeFile(join(folder, ".git", "config"), config);
  if (settings) await writeFile(join(folder, "settings.json"), `${JSON.stringify(settings, null, 2)}\n`);
  return folder;
}

test("Pi's memory.mode: unset, sync with a store that has a remote and local without one; an explicit value wins", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-memory-cwd-"));
  const saved = process.env.FREEFLOW_HOME;
  const folders = [];
  try {
    const withRemote = await home({ remote: true });
    const local = await home({ remote: false });
    const explicit = await home({ remote: true, settings: { memory: { mode: "local" } } });
    folders.push(withRemote, local, explicit, cwd);
    const spec = settingSpec("memory.mode");

    assert.equal(storeHasRemote(withRemote), true);
    assert.equal(storeHasRemote(local), false);
    assert.equal(defaultValueFor(spec, withRemote), "sync");
    assert.equal(defaultValueFor(spec, local), "local");

    process.env.FREEFLOW_HOME = withRemote;
    assert.equal((await readCapabilityState(cwd)).memory.mode, "sync");
    process.env.FREEFLOW_HOME = local;
    assert.equal((await readCapabilityState(cwd)).memory.mode, "local");
    process.env.FREEFLOW_HOME = explicit;
    assert.equal((await readCapabilityState(cwd)).memory.mode, "local", "an explicit local on a store with a remote");
  } finally {
    if (saved === undefined) delete process.env.FREEFLOW_HOME;
    else process.env.FREEFLOW_HOME = saved;
    for (const folder of folders) await rm(folder, { recursive: true, force: true });
  }
});
