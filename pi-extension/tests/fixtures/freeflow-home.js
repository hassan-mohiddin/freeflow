import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * The Freeflow home a test uses (D-060): a fresh folder, set as FREEFLOW_HOME, with the everywhere settings in its
 * settings.json. A test's settings are never in its repository, and never in the user's home.
 */
export async function useFreeflowHome(settings = {}) {
  const home = await mkdtemp(join(tmpdir(), "freeflow-home-test-"));
  process.env.FREEFLOW_HOME = home;
  // `null` leaves the home with no settings file: the defaults apply.
  if (settings !== null) await writeFile(join(home, "settings.json"), `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return home;
}

/** This folder's settings in the home, keyed by its repository (folders.json); `null` removes them. */
export async function setFolderSettings(folder, settings) {
  const path = join(process.env.FREEFLOW_HOME, "folders.json");
  let all = {};
  try {
    all = JSON.parse(await readFile(path, "utf8"));
  } catch {
    // No folders yet.
  }
  if (settings === null) delete all[resolve(folder)];
  else all[resolve(folder)] = settings;
  await writeFile(path, `${JSON.stringify(all, null, 2)}\n`, "utf8");
}

/** The everywhere settings file, as a path in the test's home. */
export const everywhereFile = () => join(process.env.FREEFLOW_HOME, "settings.json");
