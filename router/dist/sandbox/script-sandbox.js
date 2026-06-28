import { DEFAULT_SCRIPT_TRANSFORM_CONFIG, SCRIPT_TRANSFORM_LANGUAGES } from "../config/config.js";
export const SCRIPT_SANDBOX_ADAPTER_CONTRACT_VERSION = 1;
export const SCRIPT_SANDBOX_REQUIRED_PROOFS = [
    "env_access_denied",
    "home_access_denied",
    "repo_access_denied",
    "vault_access_denied",
    "network_access_denied",
    "input_read_only",
    "output_escape_denied",
    "stdout_stderr_bounded",
    "timeout_enforced",
];
export const SCRIPT_SANDBOX_PROOF_FIXTURES = [
    {
        proof: "env_access_denied",
        description: "Guest code attempts to read ambient environment variables.",
        expected: "The adapter exposes no ambient environment and no secret-bearing host variables.",
        adapterAssertion: "Do not forward host env; if a runtime requires env, provide only fixed non-secret adapter values.",
        programs: {
            javascript: "writeText(typeof process === 'undefined' ? String(globalThis.env ?? '') : JSON.stringify(process.env));",
            python: "import os\nprint(dict(os.environ))",
            jq: "env",
        },
    },
    {
        proof: "home_access_denied",
        description: "Guest code attempts to read common home-directory secrets.",
        expected: "The adapter denies home directory access and returns bounded failure output.",
        adapterAssertion: "Do not mount the user's home directory or host credential paths.",
        programs: {
            javascript: "const fs = globalThis.require?.('node:fs'); writeText(fs ? fs.readFileSync('/home/user/.ssh/id_rsa', 'utf8') : 'fs unavailable');",
            python: "from pathlib import Path\nprint(Path.home())\nprint(Path('~/.ssh/id_rsa').expanduser().read_text())",
            jq: "include \"home_escape\"; .",
        },
    },
    {
        proof: "repo_access_denied",
        description: "Guest code attempts to read repo files outside mounted vault-source inputs.",
        expected: "The adapter denies repo-root access unless repo content was explicitly captured into vault input.",
        adapterAssertion: "Do not mount the repo root; mount copied input files only.",
        programs: {
            javascript: "const fs = globalThis.require?.('node:fs'); writeText(fs ? fs.readFileSync('/workspace/package.json', 'utf8') : 'fs unavailable');",
            python: "from pathlib import Path\nprint(Path('/workspace/package.json').read_text())",
            jq: "include \"repo_escape\"; .",
        },
    },
    {
        proof: "vault_access_denied",
        description: "Guest code attempts to read Freeflow vault records directly instead of copied inputs.",
        expected: "The adapter denies direct vault-root access.",
        adapterAssertion: "Never mount the vault root; copy selected source streams into the sandbox input surface.",
        programs: {
            javascript: "const fs = globalThis.require?.('node:fs'); writeText(fs ? fs.readdirSync('/vault').join('\\n') : 'fs unavailable');",
            python: "from pathlib import Path\nprint(list(Path('/vault').glob('**/*'))) ",
            jq: "include \"vault_escape\"; .",
        },
    },
    {
        proof: "network_access_denied",
        description: "Guest code attempts outbound HTTP/DNS/network access.",
        expected: "The adapter provides no fetch/socket/network capability and outbound attempts fail boundedly.",
        adapterAssertion: "Disable fetch/network host APIs and use a runtime/container policy that denies outbound network.",
        programs: {
            javascript: "if (typeof fetch === 'undefined') { writeText('fetch unavailable'); } else { throw new Error('fetch exposed'); }",
            python: "import urllib.request\nprint(urllib.request.urlopen('https://example.com', timeout=1).read())",
            jq: "def fetch($url): error(\"network unavailable\"); fetch(\"https://example.com\")",
        },
    },
    {
        proof: "input_read_only",
        description: "Guest code attempts to mutate mounted input files.",
        expected: "The adapter keeps input files read-only or presents immutable virtual input helpers.",
        adapterAssertion: "Mount input as read-only or expose read-only host helpers; mutation attempts must fail.",
        programs: {
            javascript: "const fs = globalThis.require?.('node:fs'); if (fs) { fs.writeFileSync('/input/test_log.txt', 'mutated'); writeText('mutated'); } else { writeText('fs unavailable'); }",
            python: "from pathlib import Path\nPath('/input/test_log.txt').write_text('mutated')\nprint('mutated')",
            jq: "include \"input_mutation_escape\"; .",
        },
    },
    {
        proof: "output_escape_denied",
        description: "Guest code attempts to write outside output/work or create symlink escapes.",
        expected: "The adapter collects only regular bounded files under output and rejects/ignores escapes.",
        adapterAssertion: "Write collection must resolve real paths and ignore symlinks or files outside output.",
        programs: {
            javascript: "const fs = globalThis.require?.('node:fs'); if (fs) { fs.symlinkSync('/etc/passwd', '/output/result.txt'); writeText('escape attempted'); } else { writeText('fs unavailable'); }",
            python: "from pathlib import Path\nPath('/output/result.txt').symlink_to('/etc/passwd')\nprint('escape attempted')",
            jq: "include \"output_escape\"; .",
        },
    },
    {
        proof: "stdout_stderr_bounded",
        description: "Guest code floods stdout and stderr.",
        expected: "The adapter enforces stdout/stderr/output byte caps before routing or context injection.",
        adapterAssertion: "Capture raw output into bounded buffers and mark over-cap results as partial/failed without full exact recovery claims.",
        programs: {
            javascript: "for (let i = 0; i < 1000; i++) { console.log('x'.repeat(100)); console.error('e'.repeat(100)); }",
            python: "import sys\nfor _ in range(1000):\n    print('x' * 100)\n    print('e' * 100, file=sys.stderr)",
            jq: "range(0; 1000) | (\"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\"), (\"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\" | debug | empty)",
        },
    },
    {
        proof: "timeout_enforced",
        description: "Guest code loops or runs longer than the configured wall-clock timeout.",
        expected: "The adapter terminates execution at or before the configured timeout and returns structured timeout failure.",
        adapterAssertion: "Use runtime fuel/interrupts, process timeout, or container kill semantics that cannot be bypassed by guest code.",
        programs: {
            javascript: "while (true) {}",
            python: "while True:\n    pass",
            jq: "def loop: loop; loop",
        },
    },
];
export function scriptSandboxProofFixturesForLanguage(language) {
    return SCRIPT_SANDBOX_PROOF_FIXTURES.map((fixture) => ({
        proof: fixture.proof,
        description: fixture.description,
        expected: fixture.expected,
        adapterAssertion: fixture.adapterAssertion,
        program: fixture.programs[language],
    }));
}
export const SCRIPT_SANDBOX_CANDIDATE_MECHANISMS = [
    {
        id: "node-vm",
        languages: ["javascript"],
        status: "rejected",
        reason: "Node vm or an unsandboxed Node subprocess does not isolate filesystem, environment, child process, or network access to the Freeflow contract.",
    },
    {
        id: "plain-python-subprocess",
        languages: ["python"],
        status: "rejected",
        reason: "A Python subprocess without OS isolation can access ambient filesystem, environment, imports, and network.",
    },
    {
        id: "plain-jq-subprocess",
        languages: ["jq"],
        status: "rejected",
        reason: "A jq subprocess still needs an OS sandbox before Freeflow can prove filesystem, output, and network boundaries.",
    },
    {
        id: "os-sandbox-adapter",
        languages: [...SCRIPT_TRANSFORM_LANGUAGES],
        status: "candidate_unproven",
        reason: "An OS-level sandbox may be acceptable only after an adapter implementation passes all required adversarial proofs on the target platform.",
    },
];
export async function probeScriptSandboxAdapters(options = {}) {
    const config = cloneScriptTransformConfig(options.config ?? DEFAULT_SCRIPT_TRANSFORM_CONFIG);
    const adapters = options.adapters ?? [];
    const statuses = [];
    for (const language of config.languages) {
        statuses.push(await probeLanguage(language, config, adapters));
    }
    const availableLanguages = statuses.filter((status) => status.status === "available").map((status) => status.language);
    const unavailableLanguages = statuses.filter((status) => status.status === "unavailable");
    return {
        contractVersion: SCRIPT_SANDBOX_ADAPTER_CONTRACT_VERSION,
        sandbox: config.sandbox,
        network: config.network,
        configuredLanguages: [...config.languages],
        adapterAvailable: availableLanguages.length > 0,
        adapterStatus: availableLanguages.length > 0 ? "available" : "unavailable",
        availableLanguages,
        unavailableLanguages,
        languages: statuses,
        registeredAdapters: adapters.map((adapter) => ({ id: adapter.id, version: adapter.version, languages: [...adapter.languages] })),
        requiredProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
        candidateMechanisms: SCRIPT_SANDBOX_CANDIDATE_MECHANISMS.map((candidate) => ({ ...candidate, languages: [...candidate.languages] })),
        notes: [
            "Script transform has no unsandboxed fallback.",
            "Languages remain unavailable until a registered adapter passes every required proof.",
            "Adapter availability alone does not execute scripts while scriptTransform.enabled is false.",
        ],
    };
}
export async function selectScriptSandboxAdapter(language, config, adapters = []) {
    const status = await probeLanguage(language, cloneScriptTransformConfig(config), adapters);
    if (status.status !== "available" || !status.adapterId) {
        return { ok: false, status };
    }
    const adapter = adapters.find((candidate) => candidate.id === status.adapterId);
    if (!adapter) {
        return {
            ok: false,
            status: {
                ...status,
                status: "unavailable",
                reason: `Adapter ${status.adapterId} passed probing but is not registered for execution.`,
                failedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
            },
        };
    }
    return { ok: true, adapter, status };
}
async function probeLanguage(language, config, adapters) {
    if (!config.languages.includes(language)) {
        return unavailableLanguageStatus(language, `Language ${language} is not enabled by scriptTransform.languages.`);
    }
    const matchingAdapters = adapters.filter((adapter) => adapter.languages.includes(language));
    if (matchingAdapters.length === 0) {
        return unavailableLanguageStatus(language, `No script transform sandbox adapter is registered for language ${language}.`);
    }
    const failedStatuses = [];
    for (const adapter of matchingAdapters) {
        try {
            const probe = await adapter.probe(language, config);
            if (probe.status === "available" && hasEveryRequiredProof(probe.passedProofs)) {
                const status = {
                    language,
                    status: "available",
                    reason: probe.reason,
                    adapterId: adapter.id,
                    adapterVersion: adapter.version,
                    requiredProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
                    passedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
                    failedProofs: [],
                };
                if (probe.runtime) {
                    status.runtime = probe.runtime;
                }
                return status;
            }
            const failedProofs = missingRequiredProofs(probe.passedProofs, probe.failedProofs);
            const status = {
                language,
                status: "unavailable",
                reason: probe.reason || `Adapter ${adapter.id} did not pass every required proof for ${language}.`,
                adapterId: adapter.id,
                adapterVersion: adapter.version,
                requiredProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
                passedProofs: dedupeProofs(probe.passedProofs),
                failedProofs,
            };
            if (probe.runtime) {
                status.runtime = probe.runtime;
            }
            failedStatuses.push(status);
        }
        catch (error) {
            failedStatuses.push({
                ...unavailableLanguageStatus(language, `Adapter ${adapter.id} probe failed for ${language}: ${errorMessage(error)}`),
                adapterId: adapter.id,
                adapterVersion: adapter.version,
            });
        }
    }
    const bestFailure = bestUnavailableStatus(failedStatuses);
    if (bestFailure) {
        return {
            ...bestFailure,
            reason: `No script transform sandbox adapter passed required proofs for language ${language}. Best failure from ${bestFailure.adapterId ?? "unknown adapter"}: ${bestFailure.reason}`,
        };
    }
    return unavailableLanguageStatus(language, `No script transform sandbox adapter passed required proofs for language ${language}.`);
}
function bestUnavailableStatus(statuses) {
    let best;
    for (const status of statuses) {
        if (!best || status.passedProofs.length > best.passedProofs.length) {
            best = status;
        }
    }
    return best;
}
function unavailableLanguageStatus(language, reason) {
    return {
        language,
        status: "unavailable",
        reason,
        requiredProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
        passedProofs: [],
        failedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
    };
}
function hasEveryRequiredProof(proofs) {
    return SCRIPT_SANDBOX_REQUIRED_PROOFS.every((proof) => proofs.includes(proof));
}
function missingRequiredProofs(passedProofs, failedProofs = []) {
    const missing = SCRIPT_SANDBOX_REQUIRED_PROOFS.filter((proof) => !passedProofs.includes(proof));
    return dedupeProofs([...failedProofs, ...missing]);
}
function dedupeProofs(proofs) {
    const result = [];
    for (const proof of proofs) {
        if (SCRIPT_SANDBOX_REQUIRED_PROOFS.includes(proof) && !result.includes(proof)) {
            result.push(proof);
        }
    }
    return result;
}
function cloneScriptTransformConfig(config) {
    return {
        ...config,
        languages: [...config.languages],
        limits: { ...config.limits },
    };
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
