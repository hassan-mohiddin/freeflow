#!/usr/bin/env node

// What Freeflow can do in this session (SPEC-006, section 4.6): the requests of request set 1, each as the session's
// Freeflow driver claims it, yes (it carries the request out today, with a conformance test), possible (the harness
// offers a carrier Freeflow does not use yet) or no (the harness offers none), and the event log. A driver writes its
// claims at session start to <FREEFLOW_HOME>/sessions/<session>/capabilities.json; a host with no driver (Codex,
// Cursor, Copilot, Gemini) has no file, and gets the session-start guidance only. A request that is not yes is never
// assumed: `check` exits 0 only for yes.

import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const REQUEST_SET = 1;
export const REQUESTS = [
  "pin",
  "inject",
  "forget",
  "compact",
  "checkpoint",
  "rewind",
  "route",
  "spawn",
  "send",
  "wake",
  "ask",
  "block",
  "sensors",
  "timers",
];
const CLAIMS = new Set(["yes", "possible", "no"]);

const USAGE = `Usage:
  capabilities.mjs [list] [--json] [--session <ID>] [--home <folder>]
  capabilities.mjs check <request> [--session <ID>] [--home <folder>]
What Freeflow's driver in this session claims for each request (${REQUESTS.join(", ")}): yes, possible or no,
with how or why not, and the event log. check exits 0 when the request is yes, 1 otherwise with the reason.
The session is this one (CLAUDE_CODE_SESSION_ID or FREEFLOW_SESSION) unless --session names another; the home is
FREEFLOW_HOME, else ~/.freeflow.`;

/** What a host with no Freeflow driver can do: its session-start hook delivers the guidance, and the agent runs scripts. */
const HOOK_HOST = Object.fromEntries(
  REQUESTS.map((request) => [
    request,
    request === "inject"
      ? { claim: "yes", how: "at session start only, through the host's session-start hook" }
      : request === "checkpoint"
        ? { claim: "yes", how: "Track Work's script, run by the agent" }
        : { claim: "no", how: "no Freeflow driver runs here" },
  ]),
);

function homeOf(explicit, env = process.env) {
  return resolve(explicit || env.FREEFLOW_HOME || join(homedir(), ".freeflow"));
}

/**
 * The session's claims: the driver's file when there is one and it is valid, else the hook host's. `driver` is null
 * when no driver wrote a file for the session; `problem` says why a file was not used.
 */
export function readCapabilities({ home, session }) {
  const path = session ? join(home, "sessions", session, "capabilities.json") : null;
  if (!path || !existsSync(path)) return { driver: null, path, claims: HOOK_HOST, file: null, problem: null };
  let file;
  try {
    file = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return { driver: null, path, claims: HOOK_HOST, file: null, problem: `${path} is not JSON (${error.message})` };
  }
  const problem =
    file?.v !== 1
      ? "its v is not 1"
      : file.requestSet !== REQUEST_SET
        ? `it names request set ${file.requestSet}, not ${REQUEST_SET}`
        : typeof file.claims !== "object" || file.claims === null
          ? "it has no claims"
          : null;
  if (problem) return { driver: null, path, claims: HOOK_HOST, file: null, problem: `${path}: ${problem}` };
  // A request the file leaves out, or claims in a way this script does not know, reads as no.
  const claims = Object.fromEntries(
    REQUESTS.map((request) => {
      const claim = file.claims[request];
      return [
        request,
        CLAIMS.has(claim?.claim) && typeof claim.how === "string"
          ? { claim: claim.claim, how: claim.how }
          : { claim: "no", how: "the driver does not claim it" },
      ];
    }),
  );
  return { driver: file.driver ?? "unknown driver", path, claims, file, problem: null };
}

/** The session's event log: on or off, where it is, and how many lines it holds. */
function eventLog({ home, session, file }) {
  const path = session ? join(home, "events", `${session}.jsonl`) : null;
  const on = Boolean(file?.events);
  const lines =
    path && existsSync(path) && statSync(path).size
      ? readFileSync(path, "utf8")
          .split("\n")
          .filter((line) => line.trim()).length
      : 0;
  return { on, path, lines };
}

const DRIVER_NAMES = { "claude-code-mod": "Claude Code", "pi-extension": "Pi" };

export function renderList(found, log) {
  const width = Math.max(...REQUESTS.map((request) => request.length));
  const rows = REQUESTS.map(
    (request) => `  ${request.padEnd(width)} ${found.claims[request].claim.padEnd(8)}  ${found.claims[request].how}`,
  );
  if (!found.driver) {
    return [
      "No Freeflow driver runs in this session: only the session-start guidance arrives here, and the agent runs Freeflow's scripts itself.",
      ...(found.problem ? [`(${found.problem})`] : []),
      ...rows,
      "Event log: none; no driver writes one here.",
    ].join("\n");
  }
  const file = found.file;
  const head = `Freeflow on ${DRIVER_NAMES[found.driver] ?? found.driver} (${found.driver}${file.freeflow ? ` ${file.freeflow}` : ""}, request set ${file.requestSet}, ${file.mode ?? "mode unknown"})${file.enabled === false ? ": Freeflow is off in this session" : ""}`;
  const events = log.on
    ? `Event log: on, ${log.path} (${log.lines.toLocaleString("en-US")} line(s))`
    : `Event log: off${file.enabled === false ? " (Freeflow is off)" : " (events.enabled)"}`;
  return [head, ...rows, events].join("\n");
}

function parseArgs(argv) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json" || token === "--help") options[token] = true;
    else if (token === "--session" || token === "--home") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${token}`);
      options[token] = value;
      index += 1;
    } else if (token.startsWith("--")) throw new Error(`Unknown option ${token}`);
    else positionals.push(token);
  }
  return { options, positionals };
}

export function run(argv, env = process.env) {
  const { options, positionals } = parseArgs(argv);
  if (options["--help"]) return { code: 0, out: `${USAGE}\n` };
  const [operation = "list", request, extra] = positionals;
  if (!["list", "check"].includes(operation) || extra !== undefined) throw new Error(USAGE);
  const home = homeOf(options["--home"], env);
  const session = options["--session"] ?? (env.CLAUDE_CODE_SESSION_ID || env.FREEFLOW_SESSION || null);
  const found = readCapabilities({ home, session });
  if (operation === "check") {
    if (!REQUESTS.includes(request ?? ""))
      throw new Error(`check takes one request of set ${REQUEST_SET}: ${REQUESTS.join(", ")}`);
    const claim = found.claims[request];
    const where = found.driver ? (DRIVER_NAMES[found.driver] ?? found.driver) : "no driver";
    return {
      code: claim.claim === "yes" ? 0 : 1,
      out: `${request}: ${claim.claim} (${where}): ${claim.how}\n`,
    };
  }
  const log = eventLog({ home, session, file: found.file });
  if (options["--json"]) {
    const json = found.file ?? {
      v: 1,
      requestSet: REQUEST_SET,
      driver: null,
      events: false,
      claims: found.claims,
      ...(session ? {} : { session: null }),
    };
    return { code: 0, out: `${JSON.stringify({ ...json, eventLog: { ...log } }, null, 2)}\n` };
  }
  return { code: 0, out: `${renderList(found, log)}\n` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { code, out } = run(process.argv.slice(2));
    process.stdout.write(out);
    process.exitCode = code;
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exitCode = 2;
  }
}
