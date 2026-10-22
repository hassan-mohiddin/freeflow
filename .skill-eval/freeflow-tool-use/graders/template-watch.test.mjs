// Hidden test for template-watch: every template builds, the two broken ones say what they should, and the watcher,
// the compiler and the data are the originals (the fix belongs in the templates).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const { compile } = await import(`${process.cwd()}/.ftu-original/tools/compile.js`);
const data = JSON.parse(readFileSync(".ftu-original/data/site.json", "utf8"));
const page = (name) => compile(readFileSync(`templates/${name}.tmpl`, "utf8"), data);

test("ftu: the about page names the bistro and its address", () => {
  assert.match(page("about"), /<p>Bistro Lumière is at 12 Quai des Lanternes\.<\/p>/);
});

test("ftu: the menu lists every dish once inside its list", () => {
  const html = page("menu");
  assert.match(
    html,
    /<ul>\s*<li>Onion soup, 9 €<\/li>\s*<li>Duck confit, 24 €<\/li>\s*<li>Tarte tatin, 8 €<\/li>\s*<\/ul>/,
  );
});

test("ftu: the home page still builds", () => {
  assert.match(page("index"), /<h1>Bistro Lumière<\/h1>/);
});

test("ftu: the watcher, compiler and data are unchanged", () => {
  for (const file of ["tools/compile.js", "tools/watch.js", "data/site.json"]) {
    assert.equal(readFileSync(file, "utf8"), readFileSync(`.ftu-original/${file}`, "utf8"), file);
  }
});
