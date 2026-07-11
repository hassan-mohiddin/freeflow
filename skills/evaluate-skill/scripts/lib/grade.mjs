import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readJson } from "./workspace.mjs";

function globRegex(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replaceAll("**", "§§").replaceAll("*", "[^/]*").replaceAll("§§", ".*")}$`);
}

function getField(value, field) {
  return field.split(".").reduce((current, key) => current?.[key], value);
}

function validSkillFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return false;
  const lines = match[1].split("\n");
  const fields = Object.fromEntries(lines.map((line) => {
    const index = line.indexOf(":");
    return index < 0 ? [line.trim(), ""] : [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }));
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.name ?? "") && Boolean(fields.description);
}

async function readOptional(path) {
  try { return await readFile(path, "utf8"); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export async function gradeObjectiveRun(runDir) {
  const metadata = await readJson(resolve(runDir, "metadata.json"));
  const evalCase = await readJson(resolve(runDir, "inputs", "case.json"));
  const before = await readJson(resolve(runDir, "before-manifest.json"));
  const after = await readJson(resolve(runDir, "after-manifest.json"));
  const changedPaths = metadata.changed_paths ?? [];
  const assertionRoot = resolve(runDir, metadata.assertion_root === "skill" ? "inputs/skill" : "artifacts/workspace");
  const results = [];

  for (const assertion of evalCase.assertions) {
    let state = "pass";
    let evidence = null;
    switch (assertion.type) {
      case "semantic":
        state = "pending-semantic";
        evidence = "Requires fresh semantic grading";
        break;
      case "skill_read":
        state = metadata.activation?.skill_read ? "pass" : "fail";
        evidence = metadata.activation;
        break;
      case "skill_not_read":
        state = metadata.activation?.skill_read ? "fail" : "pass";
        evidence = metadata.activation;
        break;
      case "path_exists":
        state = after.files[assertion.path]?.type === "file" || after.files[assertion.path]?.type === "symlink" ? "pass" : "fail";
        evidence = after.files[assertion.path] ?? null;
        break;
      case "changed_paths": {
        const expected = [...assertion.equals].sort();
        const actual = [...changedPaths].sort();
        state = JSON.stringify(expected) === JSON.stringify(actual) ? "pass" : "fail";
        evidence = { expected, actual };
        break;
      }
      case "forbidden_changed_path": {
        const matcher = globRegex(assertion.glob);
        const matches = changedPaths.filter((path) => matcher.test(path));
        state = matches.length === 0 ? "pass" : "fail";
        evidence = { glob: assertion.glob, matches };
        break;
      }
      case "path_unchanged": {
        const beforeEntry = before.files[assertion.path] ?? null;
        const afterEntry = after.files[assertion.path] ?? null;
        state = JSON.stringify(beforeEntry) === JSON.stringify(afterEntry) ? "pass" : "fail";
        evidence = { before: beforeEntry, after: afterEntry };
        break;
      }
      case "line_count": {
        const entry = after.files[assertion.path] ?? (metadata.assertion_root === "skill" ? metadata.skill_manifest?.files?.[assertion.path] : null);
        state = entry?.type === "file" && entry.lines <= assertion.max ? "pass" : "fail";
        evidence = { actual: entry?.lines ?? null, max: assertion.max };
        break;
      }
      case "skill_frontmatter": {
        const text = await readOptional(resolve(assertionRoot, assertion.path));
        state = text !== null && validSkillFrontmatter(text) ? "pass" : "fail";
        evidence = { path: assertion.path };
        break;
      }
      case "forbidden_text": {
        const text = await readOptional(resolve(assertionRoot, assertion.path));
        const matches = text === null ? ["<missing-file>"] : assertion.patterns.filter((pattern) => text.toLowerCase().includes(pattern.toLowerCase()));
        state = matches.length === 0 ? "pass" : "fail";
        evidence = { matches };
        break;
      }
      case "file_contains": {
        const text = await readOptional(resolve(assertionRoot, assertion.path));
        const missing = text === null ? assertion.patterns : assertion.patterns.filter((pattern) => !text.toLowerCase().includes(pattern.toLowerCase()));
        state = missing.length === 0 ? "pass" : "fail";
        evidence = { missing };
        break;
      }
      case "json_field": {
        const text = await readOptional(resolve(assertionRoot, assertion.path));
        let actual = null;
        try { actual = getField(JSON.parse(text), assertion.field); } catch {}
        state = actual === assertion.equals ? "pass" : "fail";
        evidence = { actual, expected: assertion.equals };
        break;
      }
      case "unsupported_evidence_class": {
        const actual = metadata.evidence_classes?.requested?.[assertion.evidence_class];
        state = actual === "unsupported" ? "pass" : "fail";
        evidence = { actual };
        break;
      }
      default:
        state = "error";
        evidence = `Unknown assertion type: ${assertion.type}`;
    }
    results.push({ id: assertion.id, type: assertion.type, state, evidence });
  }

  const failed = results.some((item) => item.state === "fail" || item.state === "error");
  const pendingSemantic = results.some((item) => item.state === "pending-semantic");
  return {
    schema_version: 1,
    case_id: evalCase.id,
    variant: metadata.variant,
    verdict: failed ? "fail" : pendingSemantic ? "pending-semantic" : "pass",
    objective_pass: !failed,
    semantic_pending: pendingSemantic,
    assertions: results,
  };
}
