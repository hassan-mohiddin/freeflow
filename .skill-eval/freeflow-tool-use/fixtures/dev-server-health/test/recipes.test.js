import assert from "node:assert/strict";
import { test } from "node:test";

import { loadRecipes } from "../src/recipes.js";

test("every recipe has a name and ingredients", () => {
  for (const recipe of loadRecipes("data/recipes")) {
    assert.equal(typeof recipe.name, "string");
    assert.ok(recipe.ingredients.length > 0, recipe.name);
  }
});
