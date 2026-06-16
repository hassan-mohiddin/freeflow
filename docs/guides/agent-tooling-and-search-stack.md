# Agent Tooling and Search Stack

Date: 2026-06-15

## Purpose

This note records the current agent tooling/search setup used while working on Freeflow in this development environment. It is durable project memory, not a handoff and not product source truth.

Use it to recover how Graphify, Pi subagents, MCP, Claude Context, local Milvus, and related token-saving tools fit together. Live repo evidence and current tool output override this note when they conflict.

Do not paste API keys or tokens into this repo. The setup uses environment variables for secrets. Copy `.env.example` to `.env` for local-only values; `.env` is ignored by git.

## Current Stack

| Need | Current tool | Status |
| --- | --- | --- |
| Codebase relationship graph | Graphify | Installed and graph built for Freeflow |
| Semantic code/docs retrieval | Claude Context MCP | Installed through Pi MCP adapter and indexed |
| Vector storage | Local Milvus | Running in Docker/Colima with persistent local volumes |
| Embeddings | VoyageAI `voyage-code-3` | Configured by env var |
| Subagent delegation | `pi-subagents` | Installed and verified |
| Generic MCP in Pi | `pi-mcp-adapter` | Installed and configured |
| Token/output compression | Context Mode / RTK / Squeez | Evaluated, deferred |

## Graphify

Graphify is installed for Pi and the CLI is available as:

```bash
graphify --version
# graphify 0.8.39
```

The current graph artifacts are under:

```text
graphify-out/
```

Important generated files include:

```text
graphify-out/graph.json
graphify-out/graph.html
graphify-out/GRAPH_REPORT.md
graphify-out/cost.json
graphify-out/manifest.json
graphify-out/.graphify_analysis.json
```

Current graph evidence from `graphify-out/GRAPH_REPORT.md`:

- Built from commit `5621fdbe` / current short commit `5621fdb` at the time of this note.
- `429` nodes.
- `430` edges.
- `123` communities.
- Extraction: `97% EXTRACTED`, `3% INFERRED`, `0% AMBIGUOUS`.
- Gemini semantic extraction token accounting in `graphify-out/cost.json`: `405,819` input tokens and `19,796` output tokens, estimated at about `$0.2623` for extraction. Community-label retries used additional unreported API tokens.

Useful Graphify queries:

```bash
graphify explain "Freeflow Map"
graphify explain "Freeflow Configuration"
graphify explain "Setup Freeflow Skill"
```

Use Graphify for:

- architecture and relationship questions;
- finding hubs, communities, and cross-file links;
- explaining how docs, skills, evals, and runtime pieces relate.

Do not treat Graphify as proof for edits. Before changing files, reopen the live source files with `read`/`rg`.

### Updating Graphify

After meaningful repo changes, update the graph:

```bash
graphify update /Users/mohammedhassanmohiddin/Documents/Antigravity/Freeflow
```

If semantic extraction is needed again, it may use an LLM/API provider and cost tokens. Existing local graph queries do not require Voyage or Milvus.

## Pi Subagents

`pi-subagents` is installed as a Pi user package:

```text
npm:pi-subagents
```

Verified behavior:

- Pi discovered builtin subagents such as `scout`, `researcher`, `planner`, `worker`, `reviewer`, `context-builder`, `oracle`, and `delegate`.
- `subagent` doctor passed core runtime checks.
- A `delegate` smoke test returned `subagent execution ok`.

Use subagents for:

- second opinions;
- focused codebase reconnaissance;
- review or planning support;
- isolated implementation handoffs when the scope is clear.

Avoid multiple writer agents in the same worktree unless using isolated worktrees or a clearly controlled handoff.

## MCP Adapter and Claude Context

Pi has no native MCP support by default. This environment uses:

```text
npm:pi-mcp-adapter
```

The Claude Context MCP server is configured in the user-global MCP file:

```text
~/.config/mcp/mcp.json
```

The relevant server shape is:

```json
{
  "mcpServers": {
    "claude-context": {
      "command": "npx",
      "args": ["-y", "@zilliz/claude-context-mcp@latest"],
      "env": {
        "EMBEDDING_PROVIDER": "VoyageAI",
        "EMBEDDING_MODEL": "voyage-code-3",
        "VOYAGEAI_API_KEY": "${VOYAGEAI_API_KEY}",
        "MILVUS_ADDRESS": "127.0.0.1:19530",
        "MILVUS_TOKEN": ""
      },
      "lifecycle": "lazy",
      "idleTimeout": 10
    }
  }
}
```

`lifecycle: "lazy"` is intentional. In a fresh Pi chat, `mcp` may show `0/1 servers`; that means Claude Context is registered but idle. Connect or call it on demand:

```js
mcp({ connect: "claude-context" })
```

or use one of its tools through the MCP proxy.

Claude Context exposes:

- `claude_context_index_codebase`
- `claude_context_search_code`
- `claude_context_clear_index`
- `claude_context_get_indexing_status`

## Local Milvus and Voyage Index

The vector database is local Milvus, run through Docker/Colima. Persistent data lives under:

```text
~/.local/share/claude-context-milvus/volumes
```

Current containers:

```text
milvus-etcd
milvus-minio
milvus-standalone
```

Current endpoint:

```text
127.0.0.1:19530
```

Health endpoint:

```text
http://127.0.0.1:9091/healthz
```

Start local Milvus after a reboot:

```bash
colima start
docker start milvus-etcd milvus-minio milvus-standalone
```

Stop local Milvus:

```bash
docker stop milvus-standalone milvus-minio milvus-etcd
```

Claude Context index evidence:

```text
Path: /Users/mohammedhassanmohiddin/Documents/Antigravity/Freeflow
Status: completed
Files: 343
Chunks: 1013
Embedding model: VoyageAI voyage-code-3
Vector dimension: 1024
Milvus collection: hybrid_code_chunks_f43af001
Row count after flush: 1013
```

A smoke search for `interview gate user owned decisions` returned relevant hits in:

```text
docs/plugin-contract.md
plugins/freeflow/skills/workflow/references/workflow-map.md
```

### Search Cost

Claude Context search is not free of API usage: the query text is embedded by VoyageAI, then local Milvus searches locally. Search cost is tiny compared with indexing because only the query is embedded.

Indexing or re-indexing costs more because code/doc chunks are embedded. Local Milvus storage/search itself is local and does not create API cost.

### Updating the Vector DB

After code/doc changes, update the Claude Context index:

```js
mcp({
  tool: "claude_context_index_codebase",
  args: JSON.stringify({
    path: "/Users/mohammedhassanmohiddin/Documents/Antigravity/Freeflow",
    force: true,
    splitter: "ast",
    ignorePatterns: [
      "graphify-out/**",
      ".tmp/**",
      "tmp/**",
      "plugins/freeflow/evals/runs/**"
    ]
  })
})
```

Clear and re-index when switching embedding provider/model, because embedding dimensions may differ. This already happened once: a failed Gemini attempt created an empty `3072`-dimension collection, while `voyage-code-3` uses `1024` dimensions. Clearing the stale collection before re-indexing fixed it.

If Milvus `row_count` looks stale while search works, flush the collection and re-check. During setup, `row_count` showed `0` until flush, while direct query and Claude Context search already returned rows.

## Tool Selection Guidance

Use the tools by job:

| Job | First choice | Verify with |
| --- | --- | --- |
| Relationship / architecture questions | Graphify | `read` live files |
| Broad semantic code/docs retrieval | Claude Context MCP | `read` live files |
| Exact string/function/file discovery | `rg`, `find`, `read` | direct file inspection |
| Delegated review/planning/recon | `pi-subagents` | parent review and verification |
| Edits | direct `read` + `edit`/`write` | tests/checks and `git diff` |

Do not edit from search snippets alone. Semantic search and graph evidence are discovery tools; file reads and tests are verification tools.

## Evaluated But Deferred Tools

### Context Mode

Context Mode was evaluated as a Pi package with its own Pi extension and MCP bridge. It provides `ctx_*` tools, session tracking, FTS5 search, output containment, and context-saving workflows.

Decision for now: defer installation.

Reason:

- It should not modify Claude Context’s Milvus/Voyage vector DB.
- It can change agent tool choice by injecting routing toward `ctx_*` tools.
- It adds another session-memory/search layer on top of Graphify, Claude Context, Freeflow skills, and Pi subagents.

Future scope:

- Consider if large command outputs, web snapshots, or repeated long logs become a major context problem.
- If installed, verify `ctx-doctor`, then confirm Claude Context MCP still connects and `claude_context_search_code` still works.

### RTK

RTK was evaluated as a narrower token optimizer. Its Pi integration is rewrite-only: it mutates Bash commands into `rtk`-prefixed equivalents and fails open.

Decision for now: optional future candidate, not installed.

Reason:

- It is lighter than Context Mode and Squeez.
- It should not alter Graphify or Claude Context vector DB output.
- It only affects Bash tool calls, so it is less invasive.

Future scope:

- If trying RTK, prefer project-local or easily reversible setup first.
- Use it for reducing noisy Bash output from tests, git, package managers, and CLIs.
- Disable with `RTK_DISABLED=1` when exact raw command output matters.

### Squeez

Squeez was evaluated as a more invasive token compressor. Its Pi adapter can wrap Bash commands, post-process tool results, inject a skill/persona, and track session memory/token budget.

Decision for now: do not install.

Reason:

- It can filter tool results, not just Bash commands.
- It may compete with Freeflow behavior and with Claude Context/Graphify discovery paths.
- It adds another memory/persona layer, increasing routing ambiguity.

Future scope:

- Reconsider only if token pressure becomes severe and after testing in an isolated session.
- Avoid stacking Squeez with Context Mode and RTK unless there is clear evidence that the combined routing is safe.

## Watchouts

- `VOYAGEAI_API_KEY` must be present in the Pi process environment for Claude Context indexing/search. A local `.env` file is provided as an ignored convenience, but Pi/MCP must be started from a shell that has loaded it.
- Local Milvus must be running for Claude Context search.
- MCP `0/1 servers` is normal when the Claude Context server is lazy and idle.
- Switching embedding providers/models requires clearing the old index before re-indexing.
- Graphify can become stale when repo content changes; compare graph commit with `git rev-parse HEAD`.
- `graphify-out/` is generated output. Do not treat it as source truth for product behavior.
- Search tools can retrieve stale or partial context. Read live files before consequential edits.
- Never store API keys, Milvus tokens, or Voyage/OpenAI/Gemini secrets in repo docs or MCP config files.

## Live Evidence To Reopen

Repo-local:

```text
graphify-out/GRAPH_REPORT.md
graphify-out/cost.json
docs/guides/agent-tooling-and-search-stack.md
```

User/global environment:

```text
~/.config/mcp/mcp.json
~/.local/share/claude-context-milvus/volumes
~/.pi/agent/npm/node_modules/pi-subagents
~/.pi/agent/npm/node_modules/pi-mcp-adapter
~/.pi/agent/skills/graphify/SKILL.md
```

Useful verification commands:

```bash
pi list
graphify --version
git rev-parse --short HEAD
docker ps --filter 'name=milvus-'
```

Useful MCP checks:

```js
mcp({})
mcp({ connect: "claude-context" })
mcp({ tool: "claude_context_get_indexing_status", args: JSON.stringify({ path: "/Users/mohammedhassanmohiddin/Documents/Antigravity/Freeflow" }) })
mcp({ tool: "claude_context_search_code", args: JSON.stringify({ path: "/Users/mohammedhassanmohiddin/Documents/Antigravity/Freeflow", query: "interview gate user owned decisions", limit: 3 }) })
```
