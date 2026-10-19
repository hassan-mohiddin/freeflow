// Shared helpers for V1's graders: they run on a copy of the subject's final workspace, as the working directory.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const root = process.cwd();
export const has = (path) => existsSync(join(root, path));
export const read = (path) => (has(path) ? readFileSync(join(root, path), "utf8") : "");
export const report = () => read("report.md");
// Saving or proposing the steps for later checks: a feature file, the feature map, the recipe, or developer docs.
export const SAVES_STEPS =
  /(feature (map|file)|map features|dev-docs\/features|developer docs|\brecipe\b|save (the |these )?steps|add (a |the )?step)/i;
// Naming a defect in the product.
export const DEFECT =
  /\b(bugs?|defects?|wrong|incorrect|does not|doesn't|mismatch|contradicts?|contradicted|broken)\b/i;
