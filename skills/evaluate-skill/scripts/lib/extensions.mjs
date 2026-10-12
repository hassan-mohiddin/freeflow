import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { sha256 } from "./evidence.mjs";

/**
 * Identifies a Pi extension named on the command line, such as a provider's auth extension: a package
 * directory by its name and version, a single file by its content hash. Results are comparable only under the
 * same extensions, because an extension can change what the host sends.
 *
 * @param {string} extensionPath an absolute path
 */
export async function describeExtension(extensionPath) {
  const info = await stat(extensionPath).catch(() => null);
  if (info === null) throw new Error(`Extension not found: ${extensionPath}`);
  if (!info.isDirectory()) return { path: extensionPath, sha256: sha256(await readFile(extensionPath)) };
  const manifest = JSON.parse(await readFile(path.join(extensionPath, "package.json"), "utf8").catch(() => "{}"));
  const name = typeof manifest.name === "string" ? manifest.name : null;
  const version = typeof manifest.version === "string" ? manifest.version : null;
  return { path: extensionPath, package: name && version ? `${name}@${version}` : null };
}

/** A short label for the run plan. */
export function extensionLabel(extension) {
  return (
    extension.package ??
    `${path.basename(extension.path)}${extension.sha256 ? ` (${extension.sha256.slice(0, 12)})` : ""}`
  );
}
