import { createHmac, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function initializeProof(root, content) {
  await mkdir(root, { recursive: true });
  const key = randomBytes(32);
  await writeFile(join(root, "content.txt"), content);
  await writeFile(join(root, "anchor.key"), key);
  await writeFile(join(root, "manifest.mac"), createHmac("sha256", key).update(content).digest("hex"));
}

export async function verifyProof(root) {
  const [content, key, expectedMac] = await Promise.all([
    readFile(join(root, "content.txt"), "utf8"),
    readFile(join(root, "anchor.key")),
    readFile(join(root, "manifest.mac"), "utf8"),
  ]);
  const actualMac = createHmac("sha256", key).update(content).digest("hex");
  if (actualMac !== expectedMac) throw new Error("integrity failure");
  return content;
}
