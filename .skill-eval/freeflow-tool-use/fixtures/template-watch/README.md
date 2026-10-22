# bistro-site

The bistro's static site. Pages are templates in `templates/`, filled from `data/site.json` into `dist/`.

```sh
npm run watch
```

The watcher builds every template when it starts and again whenever one changes, and prints one line per template:
`ok <template> -> <page>` or `error <template>:<line>: <problem>`.

## Templates

- `{{name}}` inserts a value from `data/site.json`.
- `{{#each list}} ... {{/each}}` repeats its body for each entry of a list; inside, `{{field}}` reads the entry.
