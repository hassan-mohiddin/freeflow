import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { join } from "node:path";
import { TextDecoder } from "node:util";
import { isStoreManifest } from "./contracts.js";
import { canonicalStoreJson, JournalError } from "./journal.js";
const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
const MAX_MANIFEST_BYTES = 4096;
export async function readManifest(root) {
  const path = join(root, "manifest.json");
  let file;
  let existed = false;
  try {
    const named = await lstat(path, { bigint: true });
    existed = true;
    if (!named.isFile() || named.isSymbolicLink())
      throw new JournalError("manifest_invalid", "Manifest is not a regular file.");
    file = await open(path, constants.O_RDONLY | noFollow);
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(MAX_MANIFEST_BYTES))
      throw new JournalError("manifest_invalid", "Manifest exceeds its supported shape.");
    const body = await file.readFile();
    const after = await file.stat({ bigint: true });
    const current = await lstat(path, { bigint: true });
    const signature = (value) => [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs].join(":");
    if (
      signature(named) !== signature(before) ||
      signature(before) !== signature(after) ||
      signature(after) !== signature(current) ||
      body.length !== Number(before.size)
    )
      throw new JournalError("manifest_changed", "Manifest changed during readback.");
    let parsed;
    try {
      parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
    } catch {
      throw new JournalError("manifest_invalid", "Manifest encoding or JSON is invalid.");
    }
    if (!isStoreManifest(parsed))
      throw new JournalError("manifest_invalid", "Manifest version or fields are unsupported.");
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") {
      if (existed) throw new JournalError("manifest_changed", "Manifest disappeared during readback.");
      return undefined;
    }
    if (error instanceof JournalError) throw error;
    throw new JournalError("manifest_unavailable", "Manifest cannot be read safely.");
  } finally {
    await file?.close();
  }
}
export async function ensureManifest(root, expected, recovered) {
  if (!isStoreManifest(expected)) throw new JournalError("manifest_invalid", "Requested manifest is invalid.");
  const existing = await readManifest(root);
  if (existing) {
    if (
      existing.storeId !== expected.storeId ||
      existing.originSessionId !== expected.originSessionId ||
      existing.host.id !== expected.host.id ||
      existing.host.contract !== expected.host.contract
    )
      throw new JournalError("manifest_identity", "Existing store identity differs from the requested origin.");
    for (const domain of ["execution", "guidance"])
      if (existing.domains[domain]?.schema !== expected.domains[domain]?.schema)
        throw new JournalError("manifest_version", "An active store domain has an unsupported schema.");
    return existing;
  }
  if (recovered.entries.length || recovered.trailingBytes)
    throw new JournalError("manifest_missing", "Store data exists without its manifest; it cannot be rebound.");
  const path = join(root, "manifest.json");
  let file;
  try {
    file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | noFollow, 0o600);
    await file.writeFile(JSON.stringify(expected));
    await file.sync();
  } catch {
    throw new JournalError("manifest_uncertain", "Manifest publication is uncertain.");
  } finally {
    await file?.close();
  }
  const dir = await open(root, constants.O_RDONLY | noFollow);
  try {
    await dir.sync();
  } finally {
    await dir.close();
  }
  const accepted = await readManifest(root);
  if (!accepted || canonicalStoreJson(accepted) !== canonicalStoreJson(expected))
    throw new JournalError(
      "manifest_uncertain",
      "Manifest readback did not establish the requested identity and versions.",
    );
  return accepted;
}
