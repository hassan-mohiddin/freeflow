# jobs

A small job queue with a command line.

```text
node src/cli.js add "Resize images"
node src/cli.js list
node src/cli.js done 2
```

Jobs are saved in `data/jobs.json`. `src/queue.js` holds the queue, `src/format.js` turns a job into a line of text, `src/store.js` reads and writes the data file, and `src/cli.js` is the command line. Run the tests with `npm test`.
