// Hidden test for move-helper: formatMoney lives in src/money.js, nothing names formatPrice any more, everything that
// used it imports the new one, and every page prints exactly what it printed before.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const at = (file) => `${process.cwd()}/${file}`;
const lines = [
  { name: "Blue mug", cents: 1250, qty: 2 },
  { name: "Tea, 100g", cents: 495, qty: 1 },
];

test("ftu: src/money.js exports formatMoney with the same output", async () => {
  assert.ok(existsSync("src/money.js"), "src/money.js does not exist");
  const { formatMoney } = await import(at("src/money.js"));
  assert.equal(formatMoney(1234), "€12.34");
  assert.equal(formatMoney(5), "€0.05");
  assert.equal(formatMoney(-250), "-€2.50");
});

test("ftu: utils.js keeps slugify and no longer has the price helper", async () => {
  const utils = await import(at("src/utils.js"));
  assert.equal(utils.slugify("Blue Mug!"), "blue-mug");
  assert.equal(utils.formatPrice, undefined);
  assert.equal(utils.formatMoney, undefined);
});

test("ftu: nothing names formatPrice any more", () => {
  for (const folder of ["src", "test"]) {
    for (const file of readdirSync(folder)) {
      assert.ok(!readFileSync(`${folder}/${file}`, "utf8").includes("formatPrice"), `${folder}/${file}`);
    }
  }
});

test("ftu: the cart, invoice and receipt import formatMoney from money.js", () => {
  for (const file of ["src/cart.js", "src/invoice.js", "src/receipt.js"]) {
    const text = readFileSync(file, "utf8");
    assert.match(text, /import\s*\{[^}]*\bformatMoney\b[^}]*\}\s*from\s*["']\.\/money\.js["']/, file);
  }
});

test("ftu: every page prints what it printed before", async () => {
  const { cartSummary } = await import(at("src/cart.js"));
  const { invoice } = await import(at("src/invoice.js"));
  const { receipt } = await import(at("src/receipt.js"));
  assert.equal(cartSummary(lines), "2 × Blue mug: €25.00\n1 × Tea, 100g: €4.95\nTotal: €29.95");
  assert.equal(receipt(lines, 3000), "Total €29.95\nPaid €30.00\nChange €0.05");
  assert.equal(
    invoice({ id: "A-7", lines }),
    [
      "Invoice A-7",
      "blue-mug           2      €25.00",
      "tea-100g           1       €4.95",
      "TOTAL                    €29.95",
    ].join("\n"),
  );
});
