// `--source <arm>=<commit>`: for one run only, every Git source ref an arm declares (its subject source, its
// Freeflow source, and its source-built host extensions) is replaced by a commit. The definition files never
// change; the override is recorded in invocation.json and on each run, and it reaches the run's recorded source
// identity and its reuse key, because both read the effective configuration. An arm with no Git source refuses it.

import { ARM_NAME } from "./arms.mjs";

const COMMIT = /^[0-9a-f]{7,64}$/;

/**
 * Parses `<arm>=<commit>` values into `{ <arm>: <commit> }`.
 *
 * @param {string[]} values
 */
export function parseSourceOverrides(values) {
  const sources = {};
  for (const value of values) {
    const match = /^([^=]+)=(.+)$/.exec(value);
    if (match === null || !ARM_NAME.test(match[1]) || !COMMIT.test(match[2])) {
      throw new Error(`--source must be <arm>=<commit SHA>, such as candidate=3415a8a2: ${value}`);
    }
    if (Object.hasOwn(sources, match[1])) throw new Error(`--source ${match[1]} may be supplied only once`);
    sources[match[1]] = match[2];
  }
  return sources;
}

/**
 * Applies source overrides to a selection's groups in place, before anything runs. Every overridden arm must be
 * an arm of each selected group and declare at least one Git source there.
 *
 * @param {{groups: Array<{group: any}>}} selection
 * @param {Record<string, string> | null | undefined} sources
 */
export function applySourceOverrides(selection, sources) {
  if (!sources || Object.keys(sources).length === 0) return;
  for (const [arm, commit] of Object.entries(sources)) {
    for (const { group } of selection.groups) {
      const variant = group.variants?.[arm];
      if (variant === undefined) throw new Error(`--source ${arm}: ${arm} is not an arm of group ${group.id}`);
      const configuration = group.configurations?.[arm];
      let replaced = 0;
      if (variant.source?.kind === "git") {
        variant.source = { ...variant.source, ref: commit };
        if (configuration?.subject?.source?.kind === "git") configuration.subject.source.ref = commit;
        replaced += 1;
      }
      if (variant.freeflow?.source?.kind === "git") {
        variant.freeflow = { ...variant.freeflow, source: { ...variant.freeflow.source, ref: commit } };
        if (configuration?.freeflow?.source) configuration.freeflow.source.ref = commit;
        replaced += 1;
      }
      variant.hostExtensions = (variant.hostExtensions ?? []).map((extension) => {
        if (extension?.source?.kind !== "git") return extension;
        replaced += 1;
        return { ...extension, source: { ...extension.source, ref: commit } };
      });
      if (configuration?.host?.extensions) configuration.host.extensions = variant.hostExtensions;
      if (replaced === 0) {
        throw new Error(`--source ${arm}: arm ${arm} of group ${group.id} declares no Git source to override`);
      }
    }
  }
}
