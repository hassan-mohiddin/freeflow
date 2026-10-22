import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { repository, run } from "./helpers.mjs";

const script = resolve("skills/execute-work/scripts/touch-map.mjs");

const files = {
  "src/settings.js": [
    "export function loadTheme(store) {",
    "  return store.theme ?? 'light';",
    "}",
    "export function saveTheme(store, value) {",
    "  store.theme = value;",
    "}",
    "",
  ].join("\n"),
  "src/app.js": [
    'import { loadTheme } from "./settings.js";',
    "export function start(store) {",
    "  setInterval(() => render(loadTheme(store)), 1000);",
    "}",
    "",
  ].join("\n"),
  "src/sync.js": "export const pull = (remote, store) => { store.theme = remote.theme; };\n",
  "test/settings.test.js": 'import { loadTheme } from "../src/settings.js";\ntest("default", () => loadTheme({}));\n',
};

test("touch-map labels entry points, readers, writers, scheduled code and tests, with what it did not search", async () => {
  const root = await repository("touch-map-", {
    ...files,
    "dev-docs/README.md": "# Docs\n",
    "dev-docs/settings.md":
      "# Settings\n\n> **Covers:** `src/settings.js`\n> **Verified at:** `HEAD`\n\n## Theme\n\nThe theme lives in `src/settings.js`.\n",
  });
  try {
    const symbol = JSON.parse(run(script, root, ["--symbol", "theme", "--json"]).stdout).maps[0];
    const block = (label) => symbol.blocks.find((each) => each.label.startsWith(label));
    assert.deepEqual(block("writers").results, [
      "src/settings.js:5: store.theme = value;",
      "src/sync.js:1: export const pull = (remote, store) => { store.theme = remote.theme; };",
    ]);
    assert.deepEqual(block("readers").results, ["src/settings.js:2: return store.theme ?? 'light';"]);
    assert.ok(block("writers").notSearched.some((each) => each.startsWith("data already stored")));

    const fn = JSON.parse(run(script, root, ["--symbol", "loadTheme", "--json"]).stdout);
    const map = fn.maps[0];
    assert.deepEqual(map.definedIn, ["src/settings.js:1"]);
    const labelled = Object.fromEntries(map.blocks.map((each) => [each.label.split(" (")[0], each]));
    assert.deepEqual(labelled["entry points"].results, [
      "src/app.js:3: setInterval(() => render(loadTheme(store)), 1000);",
    ]);
    assert.equal(labelled["scheduled or concurrent code in the files that use it"].count, 1);
    assert.equal(labelled["covering tests"].count, 2);
    // Developer docs covering the file the symbol is defined in.
    assert.equal(fn.docs.source, "docs-check --covering");
    assert.deepEqual(
      fn.docs.paths[0].documents.map((doc) => [doc.path, doc.heading]),
      [["dev-docs/settings.md", "Theme"]],
    );

    const file = JSON.parse(run(script, root, ["--file", "src/settings.js", "--cap", "1", "--json"]).stdout).maps[0];
    const importers = file.blocks.find((each) => each.label.startsWith("entry points"));
    assert.deepEqual(importers.results, ['src/app.js:1: import { loadTheme } from "./settings.js";']);
    assert.equal(file.blocks.find((each) => each.label === "covering tests").count, 1);

    const text = run(script, root, ["--symbol", "theme"]).stdout;
    assert.match(text, /--- writers \(where old data comes from\): 2\n/);
    assert.match(text, /not searched: /);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("touch-map falls back to a capped docs search when no document has a Covers line", async () => {
  const root = await repository("touch-map-docs-", {
    ...files,
    "dev-docs/README.md": "# Docs\n\nSettings are read by `src/settings.js` at start.\n",
  });
  try {
    const docs = JSON.parse(run(script, root, ["--file", "src/settings.js", "--json"]).stdout).docs;
    assert.match(docs.source, /^capped search of dev-docs/);
    assert.deepEqual(
      docs.paths[0].documents.map((doc) => doc.path),
      ["dev-docs/README.md"],
    );
    assert.equal(run(script, root, []).status, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
