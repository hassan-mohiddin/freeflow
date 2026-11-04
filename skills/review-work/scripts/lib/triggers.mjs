// The built-in review triggers (SPEC-007 4.2), read by review-plan.mjs and review-packet.mjs, so the plan and the brief
// cannot disagree. Each fires on a changed file by its path or by what its diff changes, and says why:
// - security: an auth, permission, secret or credential folder or file name (a doc's name does not count), a .env or
//   key file, or a changed line with a permission decision, a credential read or a crypto call;
// - data: a migration, a schema file or a database script;
// - ci: CI workflow files and release scripts;
// - public interface, by content, base against head: a skill's name or description, a command in command-surface.json,
//   a key in the settings table (SETTINGS in pi-extension/src/host/config-validation.ts), package.json's bin, exports
//   or main.
// A file whose content cannot be read (binary, or larger than MAX_BYTES) is judged by its path alone, and named.
import { spawnSync } from "node:child_process";

/** Each built-in with its default depth and tier; a project changes a depth only through its base's builtins. */
export const BUILTINS = [
  { name: "security", depth: "deep", tier: "security" },
  { name: "data", depth: "deep", tier: "standard" },
  { name: "ci", depth: "deep", tier: "standard" },
  { name: "public interface", depth: "deep", tier: "standard" },
];

export const MAX_BYTES = 1024 * 1024;
const DOC = /\.(md|mdx|markdown|txt|rst|adoc)$/i;
const SECURITY_WORDS = new Set([
  "auth",
  "authn",
  "authz",
  "authentication",
  "authorization",
  "authorize",
  "oauth",
  "oidc",
  "saml",
  "login",
  "password",
  "passwords",
  "passwd",
  "secret",
  "secrets",
  "credential",
  "credentials",
  "permission",
  "permissions",
  "acl",
  "acls",
  "rbac",
  "crypto",
  "vault",
]);
const KEY_FILE = /(^|\/)(\.env(\.[^/]*)?|[^/]+\.(pem|key|p12|pfx)|id_(rsa|dsa|ecdsa|ed25519))$/i;
// Changed lines that decide access, read a credential or call cryptography. Plain hashing (createHash) is not here.
const SECURITY_CONTENT = [
  ["a permission decision", /\b(decision|behavior|permission)\b[^\n]{0,40}["'`](deny|allow|ask)["'`]/i],
  [
    "a permission decision",
    /\b(permissionDecision|hasPermission|checkPermission|requirePermission|canAccess|isAuthorized|authorize)\s*\(/,
  ],
  [
    "a credential read",
    /\b(process\.env|os\.environ|getenv)\b[^\n]{0,20}(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|CREDENTIAL)/i,
  ],
  ["a credential read", /\b(getSecret|getPassword|keytar|keychain|secretsManager|SecretManager)\b/],
  ["a credential read", /\bauthorization\b[^\n]{0,10}["'`]?\s*(Bearer|Basic)\b|BEGIN [A-Z ]*PRIVATE KEY/i],
  [
    "a crypto call",
    /\bcrypto\.(createHmac|createCipheriv|createDecipheriv|createSign|createVerify|generateKeyPair|pbkdf2|scrypt|randomBytes|timingSafeEqual|subtle)\b|\b(bcrypt|argon2|jwt\.(sign|verify)|jsonwebtoken|createHmac|createCipheriv)\b/,
  ],
];
const DATA_WORDS = new Set(["migration", "migrations", "migrate", "schema", "schemas"]);
const DATA_FILE = /\.(sql|prisma)$/i;
const CI_FILE =
  /^(\.github\/(workflows|actions)\/|\.gitlab-ci|\.circleci\/|\.buildkite\/)|(^|\/)(Jenkinsfile|azure-pipelines\.ya?ml|\.travis\.yml)$|(^|\/)release[^/]*\.(c|m)?(js|ts|sh|py)$/i;
const SETTINGS_FILE = "pi-extension/src/host/config-validation.ts";
const INTERFACE_PATH = /(^|\/)SKILL\.md$|^command-surface\.json$|^package\.json$/;

/** The lowercase words of a path segment: auth-middleware.ts, authMiddleware.ts and auth_v2 all give "auth". */
function words(segment) {
  return segment
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.toLowerCase().replace(/\d+$/, ""))
    .filter(Boolean);
}

/** Whether a folder in the path, or the file's own name unless it is a doc, holds one of the words. */
function namedFor(path, vocabulary) {
  const segments = path.split("/");
  const name = segments.pop();
  const folders = segments.filter((segment) => words(segment).some((word) => vocabulary.has(word)));
  if (folders.length) return `under ${folders.at(-1)}/`;
  if (!DOC.test(name) && words(name.replace(/\.[^.]*$/, "")).some((word) => vocabulary.has(word)))
    return `named ${name}`;
  return null;
}

const git = (root, args) => {
  const run = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return run.status === 0 ? run.stdout : null;
};

/** A file's text at a commit, or null when it is absent there; "too large" when it is over MAX_BYTES. */
export function textAt(root, commit, path) {
  const size = git(root, ["cat-file", "-s", `${commit}:${path}`]);
  if (size === null) return null;
  if (Number(size) > MAX_BYTES) return { tooLarge: true };
  return { text: git(root, ["show", `${commit}:${path}`]) ?? "" };
}

/** The changed lines of each file, added and removed, from one zero-context diff. */
export function changedLines(root, base, head) {
  const out =
    git(root, [
      "-c",
      "core.quotePath=false",
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--no-renames",
      "-U0",
      base,
      head,
    ]) ?? "";
  const lines = new Map();
  let current = null;
  let header = false;
  for (const line of out.split("\n")) {
    if (line.startsWith("diff --git ")) {
      header = true;
      current = null;
      continue;
    }
    if (header) {
      // A deleted file keeps its old path; any other file is named by its new one.
      const old = /^--- a\/(.*)$/.exec(line);
      const now = /^\+\+\+ b\/(.*)$/.exec(line);
      if (old) current = old[1];
      if (now) current = now[1];
      if (line.startsWith("@@")) header = false;
      continue;
    }
    if (current && /^[+-]/.test(line)) {
      if (!lines.has(current)) lines.set(current, []);
      lines.get(current).push(line.slice(1));
    }
  }
  return lines;
}

/** A SKILL.md's front matter name and description. */
function frontMatter(text) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text ?? "")?.[1] ?? "";
  const field = (name) => new RegExp(`^${name}:\\s*(.*)$`, "m").exec(block)?.[1].trim() ?? null;
  return { name: field("name"), description: field("description") };
}

/** Every command command-surface.json defines, as "command -> what runs it". */
function commandsOf(text) {
  const found = new Map();
  const walk = (value) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      if (typeof value.command === "string") found.set(value.command, JSON.stringify(value));
      Object.values(value).forEach(walk);
    }
  };
  try {
    walk(JSON.parse(text));
  } catch {
    return null;
  }
  return found;
}

/** The settings keys the SETTINGS table names, as written in its rows. */
function settingKeysOf(text) {
  const table = /export const SETTINGS[^=]*=\s*\[([\s\S]*?)\n\];/.exec(text)?.[1];
  if (table === undefined) return null;
  return new Set([...table.matchAll(/\bkey:\s*(["'`])([^"'`]+)\1/g)].map((match) => match[2]));
}

/** package.json's bin, exports and main, as JSON. */
function packageInterface(text) {
  try {
    const json = JSON.parse(text);
    return JSON.stringify({ bin: json.bin, exports: json.exports, main: json.main });
  } catch {
    return null;
  }
}

const diffSets = (before, after) => {
  const added = [...after.keys()].filter((key) => !before.has(key));
  const removed = [...before.keys()].filter((key) => !after.has(key));
  const changed = [...after.keys()].filter((key) => before.has(key) && before.get(key) !== after.get(key));
  return { added, removed, changed };
};
const asMap = (set) => new Map([...set].map((key) => [key, key]));
const list = (items) =>
  items.length > 3 ? `${items.slice(0, 3).join(", ")} and ${items.length - 3} more` : items.join(", ");

/** Why a file changes a public interface, comparing its content at base and head; null when it does not. */
function interfaceChange(path, before, after) {
  if (/(^|\/)SKILL\.md$/.test(path)) {
    if (!before) return "adds a skill";
    if (!after) return "removes a skill";
    const [old, now] = [frontMatter(before), frontMatter(after)];
    const fields = ["name", "description"].filter((field) => old[field] !== now[field]);
    return fields.length ? `changes its ${fields.join(" and ")}` : null;
  }
  if (path === "command-surface.json") {
    const [old, now] = [commandsOf(before ?? "{}"), commandsOf(after ?? "{}")];
    if (!old || !now) return "changes the command surface (unparsed)";
    const { added, removed, changed } = diffSets(old, now);
    const parts = [
      added.length && `adds ${list(added)}`,
      removed.length && `removes ${list(removed)}`,
      changed.length && `changes ${list(changed)}`,
    ].filter(Boolean);
    return parts.length ? parts.join("; ") : null;
  }
  if (path === SETTINGS_FILE) {
    const [old, now] = [settingKeysOf(before ?? ""), settingKeysOf(after ?? "")];
    if (!old || !now) return now ? "adds the settings table" : old ? "removes the settings table" : null;
    const { added, removed } = diffSets(asMap(old), asMap(now));
    const parts = [added.length && `adds settings key ${list(added)}`, removed.length && `removes ${list(removed)}`];
    return parts.filter(Boolean).join("; ") || null;
  }
  if (path === "package.json") {
    const [old, now] = [packageInterface(before ?? "{}"), packageInterface(after ?? "{}")];
    return old !== now ? "changes package.json's bin, exports or main" : null;
  }
  return null;
}

/**
 * The built-in triggers the change fires, each with the files that fire it and why, and the files judged by path alone.
 * @param {{ root: string, base: string, head: string, files: { path: string, oldPath?: string, binary: boolean }[] }} input
 */
export function detectBuiltins({ root, base, head, files }) {
  const hits = new Map(BUILTINS.map((builtin) => [builtin.name, []]));
  const byPathOnly = [];
  const lines = changedLines(root, base, head);
  const fire = (name, path, why) => hits.get(name).push({ path, why });
  for (const file of files) {
    const { path } = file;
    // Content first, where it can be read; a file it cannot read falls back to its path, and is named.
    const [before, after] = [textAt(root, base, file.oldPath ?? path), textAt(root, head, path)];
    const unreadable = file.binary
      ? "binary"
      : before?.tooLarge || after?.tooLarge
        ? `larger than ${MAX_BYTES / 1024 / 1024} MB`
        : null;
    if (unreadable) byPathOnly.push({ path, reason: unreadable });

    const security = namedFor(path, SECURITY_WORDS) ?? (KEY_FILE.test(path) ? "a key or environment file" : null);
    if (security) fire("security", path, security);
    else if (!unreadable) {
      const changed = lines.get(path) ?? [];
      const found = SECURITY_CONTENT.find(([, pattern]) => changed.some((line) => pattern.test(line)));
      if (found) fire("security", path, `changes ${found[0]} (by content)`);
    }

    const data = namedFor(path, DATA_WORDS) ?? (DATA_FILE.test(path) ? `a ${path.split(".").pop()} file` : null);
    if (data) fire("data", path, data);

    if (CI_FILE.test(path)) fire("ci", path, "a CI or release file");

    if (unreadable) {
      if (INTERFACE_PATH.test(path) || path === SETTINGS_FILE)
        fire("public interface", path, `by path: its content could not be read (${unreadable})`);
    } else if (INTERFACE_PATH.test(path) || path === SETTINGS_FILE) {
      const why = interfaceChange(path, before?.text ?? null, after?.text ?? null);
      if (why) fire("public interface", path, `${why} (by content)`);
    }
  }
  return {
    fired: BUILTINS.filter((builtin) => hits.get(builtin.name).length).map((builtin) => ({
      ...builtin,
      hits: hits.get(builtin.name),
    })),
    byPathOnly,
  };
}

/** A path glob as a regular expression: `**` any folders, `*` within one, `?` one character; `dir/` all below it. */
export function globToRegExp(glob) {
  let pattern = glob.replace(/^\.\//, "");
  if (pattern.endsWith("/")) pattern += "**";
  let out = "";
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === "*" && pattern[index + 1] === "*") {
      const slash = pattern[index + 2] === "/";
      out += slash ? "(?:.*/)?" : ".*";
      index += slash ? 2 : 1;
    } else if (char === "*") out += "[^/]*";
    else if (char === "?") out += "[^/]";
    else out += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}
