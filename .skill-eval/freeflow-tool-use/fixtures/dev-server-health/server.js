import { createHash } from "node:crypto";
import http from "node:http";

import { loadRecipes } from "./src/recipes.js";

const port = Number(process.env.PORT || 4310);
// A dev server nobody uses for ten minutes stops on its own.
const IDLE_MS = 10 * 60 * 1000;

const recipes = loadRecipes("data/recipes");
const build = createHash("sha256")
  .update(recipes.map((recipe) => JSON.stringify(recipe)).join("\n"))
  .digest("hex")
  .slice(0, 12);

console.log(`pantry: loaded ${recipes.length} recipes (build ${build}), warming the search index...`);
let idle;
const touch = () => {
  clearTimeout(idle);
  idle = setTimeout(() => {
    console.log("pantry: idle for ten minutes, stopping");
    process.exit(0);
  }, IDLE_MS);
};

const server = http.createServer((request, response) => {
  touch();
  console.log(`${request.method} ${request.url}`);
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok", recipes: recipes.length, build }));
    return;
  }
  if (request.url === "/recipes") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(recipes.map((recipe) => recipe.name)));
    return;
  }
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not found" }));
});

// Warming the index takes a few seconds; the server listens only after.
setTimeout(() => {
  server.listen(port, () => {
    console.log(`pantry dev server listening on http://localhost:${port}`);
    touch();
  });
}, 3000);
