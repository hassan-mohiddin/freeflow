// The site's template language: {{name}} inserts a value, {{#each list}} ... {{/each}} repeats a block per entry.
// compile() returns the page or throws an Error whose `line` is the template line at fault.

function fail(message, line) {
  const error = new Error(message);
  error.line = line;
  return error;
}

function lineAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

export function compile(template, data) {
  const tokens = [...template.matchAll(/\{\{\s*([#/]?)([\w.]+)?\s*([\w.]+)?\s*\}\}/g)];
  const stack = [];
  for (const token of tokens) {
    if (token[1] === "#") stack.push(token);
    if (token[1] === "/") {
      if (stack.length === 0) throw fail(`{{/${token[2]}}} closes nothing`, lineAt(template, token.index));
      stack.pop();
    }
  }
  if (stack.length > 0) {
    const open = stack.at(-1);
    throw fail(
      `{{#${open[2]} ${open[3] ?? ""}}} is never closed with {{/${open[2]}}}`.replace(" }}", "}}"),
      lineAt(template, open.index),
    );
  }
  const render = (text, scope, offset) =>
    text.replace(
      /\{\{#each\s+(\w+)\s*\}\}([\s\S]*?)\{\{\/each\}\}|\{\{\s*(\w+)\s*\}\}/g,
      (match, list, body, name, index) => {
        if (list !== undefined) {
          if (!Array.isArray(scope[list])) throw fail(`unknown list "${list}"`, lineAt(template, offset + index));
          return scope[list].map((entry) => render(body, entry, offset + index)).join("");
        }
        if (!(name in scope)) throw fail(`unknown variable "${name}"`, lineAt(template, offset + index));
        return String(scope[name]);
      },
    );
  return render(template, data, 0);
}
