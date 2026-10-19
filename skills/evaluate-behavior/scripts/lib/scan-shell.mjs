// The transcript scan's reading of a bash command: its simple commands, each as its words, and the network targets
// they reach for. It is a heuristic over shell text, not a shell: it follows quotes, `bash -c` strings, command
// substitutions and heredocs fed to a shell, and expands variables assigned a literal earlier in the same command.
// A target it cannot resolve (a variable read from a file) is not shown to be external, so it is not reported.

const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);
// Programs that only run the program after them.
const WRAPPERS = new Set(["sudo", "nohup", "command", "exec", "time", "nice", "stdbuf", "caffeinate"]);
const MAX_DEPTH = 4;

/**
 * The simple commands of a shell command line, each `{ words, bodies }`: its words with quotes removed, and the
 * text of each heredoc fed to it. A string run by a shell (`bash -c`), a command substitution and a heredoc fed to a
 * shell are parsed as commands too; a heredoc fed to anything else (a script for `node`, a JSON payload) is data.
 *
 * @param {string} text
 * @returns {{ words: string[], bodies: string[] }[]}
 */
export function simpleCommands(text, depth = 0) {
  const commands = [];
  const nested = [];
  let current = { words: [], bodies: [] };
  let word = null;
  let heredocs = [];
  const endWord = () => {
    if (word !== null) current.words.push(word);
    word = null;
  };
  const endCommand = () => {
    endWord();
    if (current.words.length > 0) commands.push(current);
    current = { words: [], bodies: [] };
  };
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === "\\") {
      if (text[index + 1] !== "\n") word = (word ?? "") + (text[index + 1] ?? "");
      index += 2;
    } else if (char === "'") {
      const end = text.indexOf("'", index + 1);
      const stop = end === -1 ? text.length : end;
      word = (word ?? "") + text.slice(index + 1, stop);
      index = stop + 1;
    } else if (char === '"') {
      let cursor = index + 1;
      let value = "";
      while (cursor < text.length && text[cursor] !== '"') {
        if (text[cursor] === "\\" && cursor + 1 < text.length) {
          value += text[cursor + 1];
          cursor += 2;
        } else {
          value += text[cursor];
          cursor += 1;
        }
      }
      word = (word ?? "") + value;
      index = cursor + 1;
    } else if (char === "$" && text[index + 1] === "(" && text[index + 2] !== "(") {
      const end = closing(text, index + 1);
      nested.push(text.slice(index + 2, end));
      word = (word ?? "") + text.slice(index, end + 1);
      index = end + 1;
    } else if (char === "`") {
      const end = text.indexOf("`", index + 1);
      const stop = end === -1 ? text.length : end;
      nested.push(text.slice(index + 1, stop));
      word = (word ?? "") + text.slice(index, stop + 1);
      index = stop + 1;
    } else if (char === "#" && word === null) {
      const end = text.indexOf("\n", index);
      index = end === -1 ? text.length : end;
    } else if (char === "<" && text[index + 1] === "<" && text[index + 2] !== "<") {
      endWord();
      let cursor = index + 2;
      const strip = text[cursor] === "-";
      if (strip) cursor += 1;
      while (text[cursor] === " " || text[cursor] === "\t") cursor += 1;
      let delimiter = "";
      while (cursor < text.length && !/[\s;&|<>()]/.test(text[cursor])) {
        if (text[cursor] !== "'" && text[cursor] !== '"' && text[cursor] !== "\\") delimiter += text[cursor];
        cursor += 1;
      }
      heredocs.push({ delimiter, strip, owner: current });
      index = cursor;
    } else if (char === "<" || char === ">") {
      endWord();
      index += 1;
      // `2>&1`, `>&2`: a descriptor, not a command separator.
      if (text[index] === "&") index += 1;
      while (text[index] === ">" || text[index] === "|") index += 1;
    } else if (char === "\n") {
      endCommand();
      index += 1;
      for (const heredoc of heredocs) {
        const body = [];
        while (index < text.length) {
          const end = text.indexOf("\n", index);
          const line = text.slice(index, end === -1 ? text.length : end);
          index = end === -1 ? text.length : end + 1;
          if ((heredoc.strip ? line.replace(/^\t+/, "") : line) === heredoc.delimiter) break;
          body.push(line);
        }
        heredoc.owner.bodies.push(body.join("\n"));
      }
      heredocs = [];
    } else if (";&|()".includes(char)) {
      endCommand();
      index += 1;
    } else if (char === " " || char === "\t" || char === "\r") {
      endWord();
      index += 1;
    } else {
      word = (word ?? "") + char;
      index += 1;
    }
  }
  endCommand();
  if (depth >= MAX_DEPTH) return commands;
  const all = [];
  for (const command of commands) {
    all.push(command);
    const { name, args } = program(command.words);
    if (SHELLS.has(name)) {
      const flag = args.findIndex((arg) => /^-[a-z]*c[a-z]*$/.test(arg));
      if (flag !== -1 && typeof args[flag + 1] === "string") all.push(...simpleCommands(args[flag + 1], depth + 1));
      for (const body of command.bodies) all.push(...simpleCommands(body, depth + 1));
    }
  }
  for (const inner of nested) all.push(...simpleCommands(inner, depth + 1));
  return all;
}

/** The index of the parenthesis that closes the one at `open`, or the text's end. */
function closing(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    else if (text[index] === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return text.length;
}

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s;

/** The program a simple command runs and its arguments: leading assignments and wrappers (`sudo`, `env`) skipped. */
export function program(words) {
  let index = 0;
  while (index < words.length) {
    const word = words[index];
    if (ASSIGNMENT.test(word)) {
      index += 1;
    } else if (WRAPPERS.has(word)) {
      index += 1;
      while (index < words.length && words[index].startsWith("-")) index += 1;
    } else if (word === "env") {
      index += 1;
      while (index < words.length && (words[index].startsWith("-") || ASSIGNMENT.test(words[index]))) index += 1;
    } else if (word === "timeout") {
      index += 1;
      while (index < words.length && words[index].startsWith("-")) index += 1;
      index += 1;
    } else {
      break;
    }
  }
  const name = (words[index] ?? "").split("/").at(-1);
  return { name, args: words.slice(index + 1) };
}

/** Variables a command line assigns a literal, in order: `NAME=value` and `export NAME=value`. */
export function assignments(commands) {
  const values = new Map();
  for (const { words } of commands) {
    for (const word of words[0] === "export" || words[0] === "local" ? words.slice(1) : words) {
      const match = ASSIGNMENT.exec(word);
      if (match === null) break;
      if (!match[2].includes("$(") && !match[2].includes("`")) values.set(match[1], expand(match[2], values));
    }
  }
  return values;
}

/** `$NAME` and `${NAME}` replaced by their literal values; unknown variables are left as they are. */
export function expand(word, values) {
  return word.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (whole, braced, bare) => {
    const value = values.get(braced ?? bare);
    return value === undefined ? whole : value;
  });
}

/**
 * Whether a host is this machine or the container's own network: loopback, `0.0.0.0`, `*.localhost`, or a name with
 * no dot (a container's service name, which a sealed run cannot resolve beyond its own network anyway).
 */
export function isInternalHost(host) {
  const name = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (name === "localhost" || name.endsWith(".localhost") || name === "0.0.0.0" || name === "::1") return true;
  if (/^127(?:\.\d{1,3}){3}$/.test(name)) return true;
  return !name.includes(".") && !name.includes(":");
}

const SCHEME_URL = /^([a-z][a-z0-9+.-]*):\/\/(?:[^@/?#\s]*@)?(\[[^\]]+\]|[^:/?#\s]+)/i;
const BARE_HOST = /^(?:[^@/\s]+@)?([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)(?::\d+)?(?:[/?#].*)?$/s;

// A bare word ending like a file name is a file, not a host (`out.json`, `notes.md`).
const FILE_ENDING = /\.(?:json|md|txt|log|js|mjs|cjs|ts|html|css|csv|xml|ya?ml|sh|py|out|body|tmp|lock|tgz|gz|zip)$/i;

/** The host a URL (or, with `bare`, a `host[:port]/path`) names; null when it is neither or still has a variable. */
function hostOf(word, { bare = true } = {}) {
  if (word.includes("$")) return null;
  const url = SCHEME_URL.exec(word);
  if (url !== null) return url[1].toLowerCase() === "file" ? null : url[2];
  if (!bare) return null;
  const host = BARE_HOST.exec(word)?.[1] ?? null;
  if (host === null || FILE_ENDING.test(host)) return null;
  // A version or other number (1.2.3) is no host; a dotted IPv4 address is.
  if (/^\d+(?:\.\d+)*$/.test(host) && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  return host;
}

// Options of an HTTP client that take a value: the value is a header, payload, file or number, never the target.
const HTTP_VALUE_OPTIONS = new Set([
  "-A",
  "-b",
  "-c",
  "-C",
  "-d",
  "-D",
  "-e",
  "-E",
  "-F",
  "-H",
  "-K",
  "-m",
  "-o",
  "-O",
  "-P",
  "-r",
  "-T",
  "-t",
  "-u",
  "-U",
  "-w",
  "-X",
  "-a",
  "-i",
  "--cacert",
  "--cert",
  "--config",
  "--connect-timeout",
  "--cookie",
  "--cookie-jar",
  "--data",
  "--data-ascii",
  "--data-binary",
  "--data-raw",
  "--data-urlencode",
  "--dump-header",
  "--form",
  "--header",
  "--key",
  "--max-time",
  "--output",
  "--output-document",
  "--post-data",
  "--post-file",
  "--referer",
  "--request",
  "--retry",
  "--timeout",
  "--tries",
  "--upload-file",
  "--user",
  "--user-agent",
  "--write-out",
]);
const SOCKET_VALUE_OPTIONS = new Set(["-w", "-p", "-s", "-x", "-X", "-i", "-q", "-O", "-I", "-T", "-V"]);
const SSH_VALUE_OPTIONS = new Set([
  "-p",
  "-P",
  "-i",
  "-l",
  "-o",
  "-F",
  "-J",
  "-b",
  "-c",
  "-D",
  "-E",
  "-e",
  "-L",
  "-m",
  "-O",
  "-Q",
  "-R",
  "-S",
  "-W",
  "-w",
  "-B",
]);

/** Positional arguments, with the values of the given options skipped. */
function positionals(args, valueOptions) {
  const found = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--url") {
      if (args[index + 1] !== undefined) found.push(args[index + 1]);
      index += 1;
    } else if (valueOptions.has(arg)) {
      index += 1;
    } else if (!arg.startsWith("-") || arg === "-") {
      if (arg !== "-") found.push(arg);
    }
  }
  return found;
}

const PACKAGE_MANAGERS = {
  npm: ["install", "i", "add", "update", "up", "upgrade"],
  pnpm: ["install", "i", "add", "update", "up"],
  yarn: ["add", "upgrade", "up"],
  bun: ["add", "install", "i"],
  pip: ["install", "download"],
  pip3: ["install", "download"],
  gem: ["install"],
  cargo: ["install", "add", "fetch"],
  go: ["get", "install"],
};
const SYSTEM_PACKAGES = {
  apt: ["install", "update", "upgrade", "dist-upgrade"],
  "apt-get": ["install", "update", "upgrade", "dist-upgrade"],
  apk: ["add", "update", "upgrade"],
  brew: ["install", "update", "upgrade", "tap"],
  yum: ["install", "update", "upgrade"],
  dnf: ["install", "update", "upgrade"],
};
// Options of a package manager that take a value that is not a package.
const PACKAGE_VALUE_OPTIONS = new Set([
  "--prefix",
  "-C",
  "--cache",
  "--registry",
  "--workspace",
  "-w",
  "--dir",
  "--cwd",
  "-t",
  "--target",
  "-r",
  "--requirement",
  "-c",
  "--constraint",
  "-i",
  "--index-url",
  "--extra-index-url",
  "--root",
]);

/** Whether a package spec names something local (a path, a file: or link: spec, a tarball beside it). */
function localSpec(spec) {
  return /^(?:\.|\/|~|file:|link:|workspace:|portal:)/.test(spec) || /\.(?:tgz|tar\.gz|whl|gem)$/.test(spec);
}

/**
 * The network attempts in one bash command: each `{ program, target }`. An HTTP client, socket tool, remote shell or
 * Git remote counts only with an external target; a package install counts only when `sealed` (the run's network
 * was "none") and it names a package from a registry, since installing the project's own dependencies or a local
 * path is ordinary work. Code in the command (a `node -e` script, a heredoc) counts when it fetches an external URL.
 *
 * @param {string} command
 * @param {{ sealed?: boolean }} [options]
 */
export function networkAttempts(command, { sealed = false } = {}) {
  const commands = simpleCommands(command);
  const values = assignments(commands);
  const attempts = [];
  const external = (name, words, options) => {
    for (const word of words) {
      const host = hostOf(expand(word, values), options);
      if (host !== null && !isInternalHost(host)) attempts.push({ program: name, target: expand(word, values) });
    }
  };
  for (const { words } of commands) {
    const { name, args } = program(words);
    if (["curl", "wget", "http", "https", "xh"].includes(name)) {
      external(name, positionals(args, HTTP_VALUE_OPTIONS));
    } else if (["nc", "ncat", "netcat", "telnet"].includes(name)) {
      external(name, positionals(args, SOCKET_VALUE_OPTIONS).slice(0, 1), { bare: true });
    } else if (name === "ssh") {
      // A remote shell's host may be an alias with no dot, so only a loopback name is this machine.
      const [host] = positionals(args, SSH_VALUE_OPTIONS);
      const target = host === undefined ? null : expand(host, values).replace(/^[^@]*@/, "");
      if (target !== null && !target.includes("$") && !isLoopbackName(target)) attempts.push({ program: name, target });
    } else if (["scp", "sftp", "rsync"].includes(name)) {
      for (const arg of positionals(args, SSH_VALUE_OPTIONS)) {
        const value = expand(arg, values);
        const remote = /^(?:[^@/\s]+@)?([^:/\s]+):/.exec(value);
        const host =
          SCHEME_URL.exec(value)?.[2] ?? (value.startsWith("/") || value.startsWith(".") ? null : remote?.[1]);
        if (host && !host.includes("$") && !isLoopbackName(host)) attempts.push({ program: name, target: value });
      }
    } else if (name === "git") {
      const rest = args.filter((arg, index) => !(args[index - 1] === "-C" || args[index - 1] === "-c"));
      const subcommand = rest.find((arg) => !arg.startsWith("-") && !ASSIGNMENT.test(arg));
      if (["clone", "fetch", "pull", "push", "ls-remote"].includes(subcommand)) {
        const after = rest.slice(rest.indexOf(subcommand) + 1).filter((arg) => !arg.startsWith("-"));
        const remotes = after
          .map((arg) => expand(arg, values))
          .map((arg) => SCHEME_URL.exec(arg)?.[2] ?? /^[^@/\s]+@([^:/\s]+):/.exec(arg)?.[1] ?? null);
        const named = remotes.filter((host) => host !== null);
        if (named.some((host) => !isLoopbackName(host))) {
          attempts.push({ program: `git ${subcommand}`, target: after.join(" ") });
        } else if (named.length === 0 && subcommand !== "clone" && after.every((arg) => !/^[./~]/.test(arg))) {
          // A remote by name (origin): whatever it points at is reached.
          attempts.push({ program: `git ${subcommand}`, target: after[0] ?? "the default remote" });
        }
      }
    } else if (sealed && (name in PACKAGE_MANAGERS || name in SYSTEM_PACKAGES || isPythonPip(name, args))) {
      const pip = isPythonPip(name, args);
      const effective = pip ? args.slice(args.indexOf("pip") + 1) : args;
      const manager = pip ? "pip" : name;
      const subcommand = effective.find((arg) => !arg.startsWith("-"));
      if (effective.includes("--offline")) continue;
      if (name in SYSTEM_PACKAGES) {
        if (SYSTEM_PACKAGES[name].includes(subcommand)) attempts.push({ program: `${name} ${subcommand}`, target: "" });
        continue;
      }
      if (!PACKAGE_MANAGERS[manager].includes(subcommand)) continue;
      const specs = positionals(effective.slice(effective.indexOf(subcommand) + 1), PACKAGE_VALUE_OPTIONS)
        .map((spec) => expand(spec, values))
        .filter((spec) => !spec.includes("$") && !localSpec(spec));
      if (specs.length > 0) attempts.push({ program: `${manager} ${subcommand}`, target: specs.join(" ") });
    }
  }
  // Code the command runs that fetches a literal URL: fetch(), http.get(), requests.get(), urlopen(), WebSocket.
  const code =
    /\b(?:fetch|https?\.(?:get|request)|axios(?:\.(?:get|post|put|request))?|got|requests\.(?:get|post|put|head)|urlopen|WebSocket)\(\s*(?:new URL\(\s*)?(["'`])([^"'`]*)\1/g;
  for (const match of command.matchAll(code)) {
    const host = hostOf(match[2].replace(/\$\{[^}]*\}/g, "x"), { bare: false });
    if (host !== null && !isInternalHost(host)) attempts.push({ program: "code", target: match[2] });
  }
  return attempts;
}

function isLoopbackName(host) {
  const name = host.toLowerCase().replace(/^\[|\]$/g, "");
  return name === "localhost" || name.endsWith(".localhost") || name === "::1" || /^127(?:\.\d{1,3}){3}$/.test(name);
}

function isPythonPip(name, args) {
  return /^python(?:3(?:\.\d+)?)?$/.test(name) && args[0] === "-m" && args[1] === "pip";
}
