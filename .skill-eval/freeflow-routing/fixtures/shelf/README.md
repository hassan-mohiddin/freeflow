# shelf

A reading list for the command line. Save links you mean to read, tag them, find them again, and browse them in a
small web view.

## Install

```sh
npm install --global .
```

shelf keeps everything in one file, `bookmarks.json`, in `~/.shelf` (or the folder `SHELF_HOME` names). You will
recieve a fresh empty shelf the first time you add something.

## Usage

```sh
shelf add https://example.com/article --title "An article" --tags reading,web
shelf list                 # newest first
shelf list --tag web       # only bookmarks tagged web
shelf list --json          # one JSON object per line
shelf search cafe          # titles and URLs that contain "cafe"
shelf remove https://example.com/article
shelf serve                # the web view on http://localhost:4173
```

## Export

```sh
shelf export --format csv > shelf.csv
shelf export --format json > shelf.json
```

The export formats are `csv` and `json`.

## Development

```sh
npm test
```

See `docs/` for the tags plan and how production is deployed.
