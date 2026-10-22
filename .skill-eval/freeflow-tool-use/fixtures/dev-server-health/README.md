# pantry

The recipe service behind the pantry app.

## Development

```sh
npm run dev     # the dev server on http://localhost:4310 (PORT to change it)
npm test
```

The dev server loads every recipe in `data/recipes/` and warms its search index before it listens, which takes a few
seconds. `GET /health` reports whether it is up, how many recipes it loaded, and the build of the data it serves.
`GET /recipes` lists them.
