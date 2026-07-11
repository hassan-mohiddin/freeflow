import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readJson } from "./workspace.mjs";

export async function collectRuns(runsRoot) {
  const entries = await readdir(runsRoot, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const runs = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const root = resolve(runsRoot, entry.name);
    try {
      const metadata = await readJson(resolve(root, "metadata.json"));
      const objective = await readJson(resolve(root, "objective-grade.json"));
      runs.push({ root, metadata, objective });
    } catch {}
  }
  return runs;
}

export function createReport(runs, { skill }) {
  const rows = runs.map((run) => ({
    run_id: run.metadata.run_id,
    case_id: run.metadata.case_id,
    variant: run.metadata.variant,
    verdict: run.objective.verdict,
    input_tokens: run.metadata.usage?.input ?? null,
    output_tokens: run.metadata.usage?.output ?? null,
    cost_usd: run.metadata.usage?.cost?.total_usd ?? null,
    evidence_classes: run.metadata.evidence_classes,
    limitations: run.metadata.limitations ?? [],
  }));
  const json = { schema_version: 1, skill, generated_at: new Date().toISOString(), runs: rows };
  const markdown = [
    `# ${skill} Skill Eval Report`,
    "",
    `Generated: ${json.generated_at}`,
    "",
    "| Case | Variant | Verdict | Input | Output | Cost USD |",
    "|---|---|---:|---:|---:|---:|",
    ...rows.map((row) => `| ${row.case_id} | ${row.variant} | ${row.verdict} | ${row.input_tokens ?? "unavailable"} | ${row.output_tokens ?? "unavailable"} | ${row.cost_usd ?? "unavailable"} |`),
    "",
    "## Limitations",
    "",
    ...([...new Set(rows.flatMap((row) => row.limitations))].map((item) => `- ${item}`)),
    "",
  ].join("\n");
  return { json, markdown };
}

export async function writeReport(reportRoot, report, name = "latest") {
  await writeFile(resolve(reportRoot, `${name}.json`), `${JSON.stringify(report.json, null, 2)}\n`);
  await writeFile(resolve(reportRoot, `${name}.md`), report.markdown);
  return { json: resolve(reportRoot, `${name}.json`), markdown: resolve(reportRoot, `${name}.md`) };
}
