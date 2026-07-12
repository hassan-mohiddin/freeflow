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
  const transcript = metadata.execution_mode === "rpc-scripted" ? await readJson(resolve(runDir, "transcript.json")) : null;
  const turnsById = new Map((transcript?.turns ?? []).map((turn) => [turn.id, turn]));
  const results = [];

  for (const assertion of evalCase.assertions) {
    const turn = assertion.turn_id ? turnsById.get(assertion.turn_id) : null;
    if (assertion.turn_id && !turn) throw new Error(`Missing transcript evidence for ${assertion.turn_id}`);
    const scopedAfter = turn?.workspace?.manifest ?? after;
    const scopedChangedPaths = turn?.workspace?.changed_paths ?? changedPaths;
    let state = "pass";
    let evidence = null;
    switch (assertion.type) {
      case "semantic":
        state = "pending-semantic";
        evidence = "Requires fresh semantic grading";
        break;
      case "skill_read": {
        const skillRead = turn ? Boolean(turn.skill_read) : Boolean(metadata.activation?.skill_read);
        state = skillRead ? "pass" : "fail";
        evidence = { skill_read: skillRead, turn_id: assertion.turn_id ?? null };
        break;
      }
      case "skill_not_read": {
        const skillRead = turn ? Boolean(turn.skill_read) : Boolean(metadata.activation?.skill_read);
        state = skillRead ? "fail" : "pass";
        evidence = { skill_read: skillRead, turn_id: assertion.turn_id ?? null };
        break;
      }
      case "path_exists":
        state = scopedAfter.files[assertion.path]?.type === "file" || scopedAfter.files[assertion.path]?.type === "symlink" ? "pass" : "fail";
        evidence = scopedAfter.files[assertion.path] ?? null;
        break;
      case "changed_paths": {
        const expected = [...assertion.equals].sort();
        const actual = [...scopedChangedPaths].sort();
        state = JSON.stringify(expected) === JSON.stringify(actual) ? "pass" : "fail";
        evidence = { expected, actual };
        break;
      }
      case "forbidden_changed_path": {
        const matcher = globRegex(assertion.glob);
        const matches = scopedChangedPaths.filter((path) => matcher.test(path));
        state = matches.length === 0 ? "pass" : "fail";
        evidence = { glob: assertion.glob, matches };
        break;
      }
      case "path_unchanged": {
        const beforeEntry = before.files[assertion.path] ?? null;
        const afterEntry = scopedAfter.files[assertion.path] ?? null;
        state = JSON.stringify(beforeEntry) === JSON.stringify(afterEntry) ? "pass" : "fail";
        evidence = { before: beforeEntry, after: afterEntry };
        break;
      }
      case "line_count": {
        const entry = scopedAfter.files[assertion.path] ?? (metadata.assertion_root === "skill" ? metadata.skill_manifest?.files?.[assertion.path] : null);
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
      case "json_field_in": {
        const text = await readOptional(resolve(assertionRoot, assertion.path));
        let actual = null;
        try { actual = getField(JSON.parse(text), assertion.field); } catch {}
        state = assertion.values.includes(actual) ? "pass" : "fail";
        evidence = { actual, expected_one_of: assertion.values };
        break;
      }
      case "turn_text_contains": {
        const text = turn?.final_text ?? "";
        const expected = assertion.contains_by_role?.[metadata.role] ?? assertion.contains ?? [];
        const forbidden = assertion.forbids_by_role?.[metadata.role] ?? assertion.forbids ?? [];
        const missing = expected.filter((pattern) => !text.includes(pattern));
        const forbidden_matches = forbidden.filter((pattern) => text.includes(pattern));
        state = missing.length === 0 && forbidden_matches.length === 0 ? "pass" : "fail";
        evidence = { turn_id: assertion.turn_id, expected, missing, forbidden_matches };
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
