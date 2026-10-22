// Hidden test for dev-server-health: health.json holds exactly what the dev server's /health returned for this data.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const { loadRecipes } = await import(`${process.cwd()}/src/recipes.js`);

test("ftu: health.json holds what /health returned", () => {
  assert.ok(existsSync("health.json"), "health.json was not written");
  const recipes = loadRecipes("data/recipes");
  const build = createHash("sha256")
    .update(recipes.map((recipe) => JSON.stringify(recipe)).join("\n"))
    .digest("hex")
    .slice(0, 12);
  assert.deepEqual(JSON.parse(readFileSync("health.json", "utf8")), { status: "ok", recipes: recipes.length, build });
});
