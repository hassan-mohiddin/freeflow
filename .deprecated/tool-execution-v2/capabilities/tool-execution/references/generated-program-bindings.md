# Exact Freeflow program bindings

Generated from the current immutable built-in descriptors by `scripts/validation/check-core-bindings.mjs`. Do not edit this reference by hand.

Declare the exact `{id, revision}` in `freeflow_run.operations`, then call `await tools.invoke(id, args)` in guest JavaScript. Only include the namespace for the selected revision; multiple revisions of one ID cannot be active in the same program. The guest receives the canonical value, not the host coverage/effect envelope. On failure, an Error exposes `code` and `effectState`; an unknown effect requires reconciliation, not retry. `needs-model` interrupts the program. The host records coverage, status, and partial receipts outside the guest return value. Runtime schemas—not these TypeScript-like declarations—enforce exact keys, bounds, patterns and authorization.

Captured `results.read(id, range)` uses the separate `freeflow_run.captures` allowlist; it is not a `tools.invoke` operation declaration. `result.read@1` and `result.read@2` below are explicit operation calls through `tools.invoke` when included in the operations allowlist.

```ts
/** result.read@1 · descriptor 5cf61fb54afb67c7433eef6e5d3e5b88d163f84bb20950cd34c4993665f0f6c2 · effects captured-read
 * Outer freeflow_run.operations must include { id: "result.read", revision: "1" }.
 * Guest tools.invoke returns only the validated canonical Value; coverage/status/effectState are host-side facts.
 * On failure it throws Error with code and effectState; needs-model interrupts the program.
 * JSON Schema bounds, patterns, exact keys and formats remain runtime-validated, not TypeScript guarantees.
 */
namespace FF_result_read_1 {
  type Input = {
    "id": string /* minLength=1, maxLength=256; enforced by runtime */;
    "maxBytes"?: number /* integer; minimum=1, maximum=32768; enforced by runtime */;
    "offsetBytes"?: number /* integer; minimum=0, maximum=9007199254740991; enforced by runtime */;
  };
  type Value = {
    "coverage": ("limited" | "unspecified");
    "id": string /* minLength=1, maxLength=256; enforced by runtime */;
    "nextOffsetBytes"?: number /* integer; minimum=1, maximum=9007199254740991; enforced by runtime */;
    "range": {
      "endBytes": number /* integer; minimum=0, maximum=9007199254740991; enforced by runtime */;
      "startBytes": number /* integer; minimum=0, maximum=9007199254740991; enforced by runtime */;
    };
    "scope": ("tool-result-hook");
    "text": string /* maxLength=32768; enforced by runtime */;
    "totalBytes": number /* integer; minimum=0, maximum=4194304; enforced by runtime */;
  };
  interface Tools { invoke(id: "result.read", args: Input): Promise<Value>; }
}

/** result.read@2 · descriptor 24fbd2a58c7e18d18ac8de82d970a50f301eb2caddf6f2b9c5b70ed90883a452 · effects captured-read
 * Outer freeflow_run.operations must include { id: "result.read", revision: "2" }.
 * Guest tools.invoke returns only the validated canonical Value; coverage/status/effectState are host-side facts.
 * On failure it throws Error with code and effectState; needs-model interrupts the program.
 * JSON Schema bounds, patterns, exact keys and formats remain runtime-validated, not TypeScript guarantees.
 */
namespace FF_result_read_2 {
  type Input = {
    "id": string /* maxLength=256, pattern="^artifact:[0-9a-f-]{36}$"; enforced by runtime */;
    "maxBytes"?: number /* integer; minimum=1, maximum=32768; enforced by runtime */;
    "offsetBytes"?: number /* integer; minimum=0, maximum=9007199254740991; enforced by runtime */;
  };
  type Value = {
    "artifactSha256": string /* pattern="^[a-f0-9]{64}$"; enforced by runtime */;
    "coverage": {
      "boundary": string /* minLength=1, maxLength=4096; enforced by runtime */;
      "capture": ("complete-at-boundary" | "limited" | "unknown");
      "detail"?: string /* minLength=1, maxLength=4096; enforced by runtime */;
    };
    "data": string /* maxLength=65536; enforced by runtime */;
    "encoding": ("utf-8" | "base64");
    "id": string /* maxLength=256, pattern="^artifact:[0-9a-f-]{36}$"; enforced by runtime */;
    "mediaType": string /* minLength=1, maxLength=4096; enforced by runtime */;
    "nextOffsetBytes"?: number /* integer; minimum=1, maximum=9007199254740991; enforced by runtime */;
    "range": {
      "endBytes": number /* integer; minimum=0, maximum=9007199254740991; enforced by runtime */;
      "startBytes": number /* integer; minimum=0, maximum=9007199254740991; enforced by runtime */;
    };
    "sha256": string /* pattern="^[a-f0-9]{64}$"; enforced by runtime */;
    "sourceObservation"?: {
      "observedBytes": number /* integer; minimum=0, maximum=9007199254740991; enforced by runtime */;
      "observedSha256": string /* pattern="^[a-f0-9]{64}$"; enforced by runtime */;
    };
    "totalBytes": number /* integer; minimum=0, maximum=9007199254740991; enforced by runtime */;
  };
  interface Tools { invoke(id: "result.read", args: Input): Promise<Value>; }
}

/** project.readText@1 · descriptor 2996578739bfc9401bd5d889985469378f3e8b8a5ffaf024fa29908b77b6eca6 · effects live-read
 * Outer freeflow_run.operations must include { id: "project.readText", revision: "1" }.
 * Guest tools.invoke returns only the validated canonical Value; coverage/status/effectState are host-side facts.
 * On failure it throws Error with code and effectState; needs-model interrupts the program.
 * JSON Schema bounds, patterns, exact keys and formats remain runtime-validated, not TypeScript guarantees.
 */
namespace FF_project_readText_1 {
  type Input = {
    "maxBytes"?: number /* integer; minimum=1, maximum=32768; enforced by runtime */;
    "offsetBytes"?: number /* integer; minimum=0, maximum=9007199254740991; enforced by runtime */;
    "path": string /* minLength=1, maxLength=4096; enforced by runtime */;
  };
  type Value = {
    "coverage": ("complete-at-boundary" | "limited");
    "nextOffsetBytes"?: number /* integer; minimum=1, maximum=9007199254740991; enforced by runtime */;
    "path": string /* minLength=1, maxLength=4096; enforced by runtime */;
    "range": {
      "endBytes": number /* integer; minimum=0, maximum=9007199254740991; enforced by runtime */;
      "startBytes": number /* integer; minimum=0, maximum=9007199254740991; enforced by runtime */;
    };
    "scope": ("whole-file-snapshot");
    "sha256": string /* pattern="^[a-f0-9]{64}$"; enforced by runtime */;
    "text": string /* maxLength=32768; enforced by runtime */;
    "totalBytes": number /* integer; minimum=0, maximum=4194304; enforced by runtime */;
  };
  interface Tools { invoke(id: "project.readText", args: Input): Promise<Value>; }
}

/** project.readRanges@1 · descriptor d9826150d59bc4c1818674be1abe8fa33014138eb52c5481b7f89f57ee59bca8 · effects live-read
 * Outer freeflow_run.operations must include { id: "project.readRanges", revision: "1" }.
 * Guest tools.invoke returns only the validated canonical Value; coverage/status/effectState are host-side facts.
 * On failure it throws Error with code and effectState; needs-model interrupts the program.
 * JSON Schema bounds, patterns, exact keys and formats remain runtime-validated, not TypeScript guarantees.
 */
namespace FF_project_readRanges_1 {
  type Input = {
    "files": ReadonlyArray<{
        "expectedRevision"?: string /* pattern="^[a-f0-9]{64}$"; enforced by runtime */;
        "path": string /* minLength=1, maxLength=1024; enforced by runtime */;
        "ranges": ReadonlyArray<{
            "endLine": number /* integer; minimum=1, maximum=9007199254740991; enforced by runtime */;
            "startLine": number /* integer; minimum=1, maximum=9007199254740991; enforced by runtime */;
          }> /* minItems=1, maxItems=8; enforced by runtime */;
      }> /* minItems=1, maxItems=4; enforced by runtime */;
    "maxBytes"?: number /* integer; minimum=512, maximum=32768; enforced by runtime */;
  };
  type Value = {
    "acquisitionBytes": number /* integer; minimum=0, maximum=8388608; enforced by runtime */;
    "coverage": ("complete-at-boundary" | "limited");
    "files": ReadonlyArray<{
        "coverage": ("complete-at-boundary" | "limited");
        "path": string /* minLength=1, maxLength=1024; enforced by runtime */;
        "revision"?: string /* pattern="^[a-f0-9]{64}$"; enforced by runtime */;
        "served": ReadonlyArray<{
            "range": {
              "endBytes": number /* integer; minimum=0, maximum=4194304; enforced by runtime */;
              "endLine": number /* integer; minimum=1, maximum=9007199254740991; enforced by runtime */;
              "startBytes": number /* integer; minimum=0, maximum=4194304; enforced by runtime */;
              "startLine": number /* integer; minimum=1, maximum=9007199254740991; enforced by runtime */;
            };
            "requested": {
              "endLine": number /* integer; minimum=1, maximum=9007199254740991; enforced by runtime */;
              "startLine": number /* integer; minimum=1, maximum=9007199254740991; enforced by runtime */;
            };
            "requestIndex": number /* integer; minimum=0, maximum=7; enforced by runtime */;
            "text": string /* maxLength=32768; enforced by runtime */;
          }> /* maxItems=8; enforced by runtime */;
        "totalBytes"?: number /* integer; minimum=0, maximum=4194304; enforced by runtime */;
        "totalLines"?: number /* integer; minimum=0, maximum=4194304; enforced by runtime */;
        "unserved": ReadonlyArray<{
            "range": {
              "endLine": number /* integer; minimum=1, maximum=9007199254740991; enforced by runtime */;
              "startLine": number /* integer; minimum=1, maximum=9007199254740991; enforced by runtime */;
            };
            "reason": ("revision_mismatch" | "out_of_range" | "response_budget" | "acquisition_budget" | "file_too_large");
            "requested": {
              "endLine": number /* integer; minimum=1, maximum=9007199254740991; enforced by runtime */;
              "startLine": number /* integer; minimum=1, maximum=9007199254740991; enforced by runtime */;
            };
            "requestIndex": number /* integer; minimum=0, maximum=7; enforced by runtime */;
          }> /* maxItems=16; enforced by runtime */;
      }> /* minItems=1, maxItems=4; enforced by runtime */;
    "scope": ("requested-project-line-ranges");
    "selectedBytes": number /* integer; minimum=0, maximum=32768; enforced by runtime */;
  };
  interface Tools { invoke(id: "project.readRanges", args: Input): Promise<Value>; }
}

/** project.findPaths@1 · descriptor 6e02d21ca3dcaaa097ee1ba52d5f2ebcb92bcf84f181fc7bdf1f11186df9eb5f · effects live-read
 * Outer freeflow_run.operations must include { id: "project.findPaths", revision: "1" }.
 * Guest tools.invoke returns only the validated canonical Value; coverage/status/effectState are host-side facts.
 * On failure it throws Error with code and effectState; needs-model interrupts the program.
 * JSON Schema bounds, patterns, exact keys and formats remain runtime-validated, not TypeScript guarantees.
 */
namespace FF_project_findPaths_1 {
  type Input = {
    "caseSensitive"?: boolean;
    "cursor"?: string /* minLength=1, maxLength=4096; enforced by runtime */;
    "maxBytes"?: number /* integer; minimum=512, maximum=32768; enforced by runtime */;
    "maxResults"?: number /* integer; minimum=1, maximum=100; enforced by runtime */;
    "paths"?: ReadonlyArray<string /* minLength=1, maxLength=4096; enforced by runtime */> /* minItems=1, maxItems=16, uniqueItems; enforced by runtime */;
    "query"?: string /* minLength=1, maxLength=256; enforced by runtime */;
  };
  type Value = {
    "backend": {
      "identity": string /* pattern="^[a-f0-9]{64}$"; enforced by runtime */;
      "version": string /* minLength=1, maxLength=128; enforced by runtime */;
    };
    "coverage": ("complete-at-boundary" | "limited");
    "next"?: string /* minLength=1, maxLength=4096; enforced by runtime */;
    "observedPaths": number /* integer; minimum=0, maximum=10000; enforced by runtime */;
    "paths": ReadonlyArray<string /* minLength=1, maxLength=4096; enforced by runtime */> /* maxItems=100; enforced by runtime */;
    "scope": ("rg-project-paths");
  };
  interface Tools { invoke(id: "project.findPaths", args: Input): Promise<Value>; }
}

/** project.searchText@1 · descriptor d6ecc3d63ce757fe22092e9ee1690a189e9d69443237b82909d7aeeb2fa91c96 · effects live-read
 * Outer freeflow_run.operations must include { id: "project.searchText", revision: "1" }.
 * Guest tools.invoke returns only the validated canonical Value; coverage/status/effectState are host-side facts.
 * On failure it throws Error with code and effectState; needs-model interrupts the program.
 * JSON Schema bounds, patterns, exact keys and formats remain runtime-validated, not TypeScript guarantees.
 */
namespace FF_project_searchText_1 {
  type Input = {
    "caseSensitive"?: boolean;
    "cursor"?: {
      "fileSha256": string /* pattern="^[a-f0-9]{64}$"; enforced by runtime */;
      "fingerprint": string /* pattern="^[a-f0-9]{64}$"; enforced by runtime */;
      "offsetBytes": number /* integer; minimum=0, maximum=9007199254740991; enforced by runtime */;
      "path": string /* minLength=1, maxLength=4096; enforced by runtime */;
    };
    "maxBytes"?: number /* integer; minimum=1024, maximum=262144; enforced by runtime */;
    "maxResults"?: number /* integer; minimum=1, maximum=100; enforced by runtime */;
    "maxScanBytes"?: number /* integer; minimum=4194304, maximum=33554432; enforced by runtime */;
    "paths": ReadonlyArray<string /* minLength=1, maxLength=4096; enforced by runtime */> /* minItems=1, maxItems=32, uniqueItems; enforced by runtime */;
    "query": string /* minLength=1, maxLength=1000; enforced by runtime */;
  };
  type Value = {
    "coverage": ("complete-at-boundary" | "limited");
    "matches": ReadonlyArray<{
        "excerpt": string /* maxLength=512; enforced by runtime */;
        "path": string /* minLength=1, maxLength=4096; enforced by runtime */;
        "range": {
          "endBytes": number /* integer; minimum=1, maximum=9007199254740991; enforced by runtime */;
          "startBytes": number /* integer; minimum=0, maximum=9007199254740991; enforced by runtime */;
        };
      }> /* maxItems=100; enforced by runtime */;
    "next"?: {
      "fileSha256": string /* pattern="^[a-f0-9]{64}$"; enforced by runtime */;
      "fingerprint": string /* pattern="^[a-f0-9]{64}$"; enforced by runtime */;
      "offsetBytes": number /* integer; minimum=0, maximum=9007199254740991; enforced by runtime */;
      "path": string /* minLength=1, maxLength=4096; enforced by runtime */;
    };
    "scannedBytes": number /* integer; minimum=0, maximum=33554432; enforced by runtime */;
    "scannedFiles": number /* integer; minimum=0, maximum=10000; enforced by runtime */;
    "scope": ("workspace-scan");
    "skippedFiles": number /* integer; minimum=0, maximum=10000; enforced by runtime */;
  };
  interface Tools { invoke(id: "project.searchText", args: Input): Promise<Value>; }
}

/** project.searchText@2 · descriptor bbaf8f390003ce024b0de559f31c41d0ac2e01260080b683a3299c280acf3d2c · effects live-read
 * Outer freeflow_run.operations must include { id: "project.searchText", revision: "2" }.
 * Guest tools.invoke returns only the validated canonical Value; coverage/status/effectState are host-side facts.
 * On failure it throws Error with code and effectState; needs-model interrupts the program.
 * JSON Schema bounds, patterns, exact keys and formats remain runtime-validated, not TypeScript guarantees.
 */
namespace FF_project_searchText_2 {
  type Input = {
    "caseSensitive"?: boolean;
    "contextLines"?: number /* integer; minimum=0, maximum=3; enforced by runtime */;
    "cursor"?: string /* minLength=1, maxLength=4096; enforced by runtime */;
    "maxBytes"?: number /* integer; minimum=512, maximum=32768; enforced by runtime */;
    "maxResults"?: number /* integer; minimum=1, maximum=100; enforced by runtime */;
    "maxScanBytes"?: number /* integer; minimum=1, maximum=33554432; enforced by runtime */;
    "mode": ("files" | "count" | "matches" | "context");
    "paths"?: ReadonlyArray<string /* minLength=1, maxLength=4096; enforced by runtime */> /* minItems=1, maxItems=16, uniqueItems; enforced by runtime */;
    "patternKind"?: ("literal" | "regex");
    "query": string /* minLength=1, maxLength=1024; enforced by runtime */;
  };
  type Value = {
    "backend": {
      "identity": string /* pattern="^[a-f0-9]{64}$"; enforced by runtime */;
      "version": string /* minLength=1, maxLength=128; enforced by runtime */;
    };
    "count": number /* integer; minimum=0, maximum=9007199254740991; enforced by runtime */;
    "coverage": ("complete-at-boundary" | "limited");
    "files": ReadonlyArray<{
        "count"?: number /* integer; minimum=0, maximum=9007199254740991; enforced by runtime */;
        "path": string /* minLength=1, maxLength=4096; enforced by runtime */;
        "revision": string /* pattern="^[a-f0-9]{64}$"; enforced by runtime */;
      }> /* maxItems=100; enforced by runtime */;
    "matches": ReadonlyArray<{
        "clipped": boolean;
        "excerpt": string /* maxLength=512; enforced by runtime */;
        "line": number /* integer; minimum=1, maximum=9007199254740991; enforced by runtime */;
        "path": string /* minLength=1, maxLength=4096; enforced by runtime */;
        "range": {
          "endBytes": number /* integer; minimum=0, maximum=4194304; enforced by runtime */;
          "startBytes": number /* integer; minimum=0, maximum=4194304; enforced by runtime */;
        };
        "revision": string /* pattern="^[a-f0-9]{64}$"; enforced by runtime */;
      }> /* maxItems=100; enforced by runtime */;
    "mode": ("files" | "count" | "matches" | "context");
    "next"?: string /* minLength=1, maxLength=4096; enforced by runtime */;
    "observedFiles": number /* integer; minimum=0, maximum=10000; enforced by runtime */;
    "scannedBytes": number /* integer; minimum=0, maximum=33554432; enforced by runtime */;
    "scannedFiles": number /* integer; minimum=0, maximum=256; enforced by runtime */;
    "scope": ("rg-workspace-scan");
    "skippedFiles": number /* integer; minimum=0, maximum=256; enforced by runtime */;
  };
  interface Tools { invoke(id: "project.searchText", args: Input): Promise<Value>; }
}

/** project.replaceExact@1 · descriptor c4d37ddf5f6b7eba284e9bf35c0eee15dc85d7a53ab65ca6639c5c014ae6a9ed · effects mutation
 * Outer freeflow_run.operations must include { id: "project.replaceExact", revision: "1" }.
 * Guest tools.invoke returns only the validated canonical Value; coverage/status/effectState are host-side facts.
 * On failure it throws Error with code and effectState; needs-model interrupts the program.
 * JSON Schema bounds, patterns, exact keys and formats remain runtime-validated, not TypeScript guarantees.
 */
namespace FF_project_replaceExact_1 {
  type Input = {
    "expectedSha256": string /* pattern="^[a-f0-9]{64}$"; enforced by runtime */;
    "oldText": string /* minLength=1, maxLength=1048576; enforced by runtime */;
    "path": string /* minLength=1, maxLength=4096; enforced by runtime */;
    "replacement": string /* maxLength=1048576; enforced by runtime */;
  };
  type Value = {
    "afterSha256": string /* pattern="^[a-f0-9]{64}$"; enforced by runtime */;
    "applied": number /* integer; minimum=1, maximum=1; enforced by runtime */;
    "beforeSha256": string /* pattern="^[a-f0-9]{64}$"; enforced by runtime */;
    "bytes": number /* integer; minimum=0, maximum=4194304; enforced by runtime */;
    "coordination": ("runtime-instance-file-exclusive");
    "path": string /* minLength=1, maxLength=4096; enforced by runtime */;
  };
  interface Tools { invoke(id: "project.replaceExact", args: Input): Promise<Value>; }
}

/** project.applyPatch@1 · descriptor ebe8d15e1a8e67322b8d3b71be0573a5b3cfe9df72a7e8a476a77b1b1ab47e94 · effects live-read|mutation
 * Outer freeflow_run.operations must include { id: "project.applyPatch", revision: "1" }.
 * Guest tools.invoke returns only the validated canonical Value; coverage/status/effectState are host-side facts.
 * On failure it throws Error with code and effectState; needs-model interrupts the program.
 * JSON Schema bounds, patterns, exact keys and formats remain runtime-validated, not TypeScript guarantees.
 */
namespace FF_project_applyPatch_1 {
  type Input = {
    "dryRun"?: boolean;
    "expectedRevisions": ReadonlyArray<{
        "path": string /* minLength=1, maxLength=4096; enforced by runtime */;
        "sha256": string /* pattern="^[a-f0-9]{64}$"; enforced by runtime */;
      }> /* minItems=1, maxItems=8; enforced by runtime */;
    "patch": string /* minLength=1, maxLength=262144; enforced by runtime */;
  };
  type Value = {
    "committedPrefix": number /* integer; minimum=0, maximum=8; enforced by runtime */;
    "coordination": ("runtime-instance-file-exclusive");
    "dryRun": boolean;
    "files": ReadonlyArray<{
        "afterSha256": string /* pattern="^[a-f0-9]{64}$"; enforced by runtime */;
        "beforeSha256": string /* pattern="^[a-f0-9]{64}$"; enforced by runtime */;
        "path": string /* minLength=1, maxLength=4096; enforced by runtime */;
        "status": ("applied" | "unchanged" | "not-applied" | "unknown");
      }> /* minItems=1, maxItems=8; enforced by runtime */;
  };
  interface Tools { invoke(id: "project.applyPatch", args: Input): Promise<Value>; }
}

```
