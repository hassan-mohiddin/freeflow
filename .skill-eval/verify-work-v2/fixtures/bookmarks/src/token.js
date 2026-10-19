import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * The access token: the configured one, else the one kept in `<dataDir>/token`, else a new one written there.
 * @param {string} dataDir
 * @param {string | null} configured
 */
export async function loadToken(dataDir, configured) {
  if (configured !== null) return configured;
  const file = path.join(dataDir, "token");
  try {
    const saved = (await readFile(file, "utf8")).trim();
    if (saved !== "") return saved;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const token = randomBytes(24).toString("base64url");
  await writeFile(file, `${token}\n`, { mode: 0o600 });
  return token;
}

/** Whether a request's `authorization` header carries the token as `Bearer <token>`. */
export function hasToken(header, token) {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  if (!match) return false;
  const given = Buffer.from(match[1]);
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
