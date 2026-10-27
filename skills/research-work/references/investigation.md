# Investigation

This reference is judgment: adapt it to the subject. The source ledger, search ledger and citation forms it uses are a contract, defined in [artifacts](artifacts.md).

Goal: every source the report relies on is pinned, read at the depth its use needs, and recorded with how it was checked, so a reader can check any claim without redoing the work.

## Choose And Pin Sources

Prefer the primary source: the code over its README, the paper over a blog about it, the specification over a tutorial, the project's own changelog over a news item. Use a secondary source to find a primary one, and record it as `summary-only` if you rely on it without reaching the primary.

Pin a source before relying on it, because sources change:

- **Code:** clone the repository and resolve the commit (`git rev-parse HEAD`); the pin is `<repository>@<commit>`. Read at that commit only; if you move to a newer one, record it as a new source.
- **Papers:** the DOI or arXiv ID, with the version you read (`arXiv:2306.05685v4`).
- **Pages and docs:** the URL with the date you read it. When a quote from a page matters, save a copy in the task's `sources/` so a later check can find the quote.

Record each source in the ledger when you first rely on it, not at the end: the ledger is how a later context, or a reviewer, knows what was actually read.

## Read At The Right Depth

Record what you read (`full`, `partial`, `abstract`) and how (`opened`, `repository-read`, `ran`). Read deeper where a claim rests on the source:

- a claim about a method needs the method section, not the abstract;
- a number needs the table or the code that produced it;
- a claim about behavior is stronger when you ran it (`ran`) than when you read the code (`repository-read`).

A tool that returns a model's summary of a page (a fetch that summarizes, a search snippet) gives you `summary-only` for anything it did not quote, even when it calls the page "opened". Quote what a claim rests on, and check the quote against a saved copy.

## Reading Code

Goal: describe what the code does at the pinned commit, with every statement traceable to lines.

- **Start from the entry points:** the command, the main loop, the handler for the request the question is about. Find them by searching for the distinctive strings the user sees (a flag, an error message, a command name), not by reading directory by directory.
- **Follow one path at a time.** Trace the request or event the question is about through the calls it makes, and write down each step with its `path:line` as you go. Read a component after the components it depends on, so its description can build on theirs.
- **Name what you did not follow.** Branches, plugins and error paths left unread go in the report's limits, not silently away.
- **Run it when you can.** A test, a command with tracing on, or a small script that calls the function turns "the code says" (L2) into "we observed" (L3). Record the command and its output; note the environment.
- **Cite as `S<n>:path:line` or `S<n>:path:start-end`,** where `S<n>` is the repository's ledger row. Cite the narrowest range that shows the claim; a citation of a whole file supports nothing in particular.
- **Configuration and defaults count.** Behavior often lives in a default value, a feature flag or a config file rather than in the function that looks responsible. Check where each value comes from before describing behavior that depends on it.

## Searching

Searches inside a pinned repository (grep for a name, a caller, an error string) are part of reading the code: name them in the report's Method, and give the search behind any absence in the claim's Scope. When the work searches papers, the web or a database, log each query and what it returned in the search ledger: one `query` line, then one `hit` line per result you looked at, with its state (`included`, `excluded` with a reason, `duplicate`, `unscreened`). Report counts from `artifact.mjs counts`, never from memory.

- Search for the mechanism as well as the name; the same idea often has several names.
- Follow citations both ways from the closest work: what it cites, and what cites it.
- Stop when new queries return only what you already have, and say so in the report's method.
- An empty search is evidence of absence only within that search; write it that way.

## Judging A Source

For each source a claim rests on, note in the report's evidence what kind of evidence it is: a controlled comparison, an observation, an author's own claim, a vendor's claim. The level of a claim comes from this (see [claims](claims.md)); the ledger's `Checked` caps it.

- **Self-reported results** (a project's own benchmark, an author's figure without a procedure) are L1 until checked independently.
- **Watch for the common failures in what you read:** a number in the abstract that the results do not contain, an interval labeled one way and computed another, replicates counted as separate items, a baseline given less tuning than the method. Note what you find; do not repeat the number as if it held.
- **Retractions and errata:** for a paper a claim leans on heavily, check whether it was retracted or corrected.

## Looking Sources Up Online

When the user asks for it, `sources.mjs lookup <sources.md> --cache <lookups.json>` looks each row's pin up: a DOI through Crossref, with any retraction or correction notice that updates it; an arXiv ID through arXiv; a URL's reachability. Answers are cached, so a second run asks nothing unless `--refresh`. It never edits the ledger; it says what each row's Lookup should read, and you change the row:

- `verified` when the identifier resolves to the work the Source names (its title, or an author with the year);
- `unresolved` when nothing is found, the service does not answer, or the record matches the Source only in part (compare them yourself);
- `refuted` only when the identifier plainly resolves to another work.

A retraction notice goes in the source's Supports or the claim's Limit, and the claim that leans on it is re-read. Keep each row's Source a citation ("Brown, Cai and DasGupta 2001. Interval estimation for a binomial proportion"), so the match has something to compare.

## Splitting Across Workers

Split the survey when the subject is larger than one context can read well: many components, many papers, several repositories. Do not split a subject one agent can read in an hour; each split costs a brief, a return and a merge.

- **Split by part of the subject,** not by step: one worker per component, per paper cluster, per repository. For code, split along the dependency order, so a worker reading a component can rely on its dependencies' returns.
- **Brief each worker with:** its part of the question; the pinned sources and where they are; the ledger and citation forms it must use (point it to [artifacts](artifacts.md)); what to return; and its limits (read-only, no paid calls, no files outside its output). Name the model and effort the worker runs on in the brief.
- **Ask for a file, not a chat reply:** its findings as claims with `S<n>:path:line` citations and levels, its ledger rows, what it read and what it did not, and the questions it could not answer. The reply is just the file's path and whether its part was covered. Where the host refuses files from a worker, ask for the same content as its reply and save it unchanged before checking it.
- **Check returns before using them.** Run `sources.mjs cite-check` on each return, with `--reads` from the worker's transcript (`sources.mjs reads <transcript.jsonl> --ledger <sources.md> --repo <name>=<clone> --out reads.jsonl`) so a citation of lines the worker never read fails, read the citations a key claim rests on yourself, and send a gap back to its worker rather than filling it with your guess.
- **One decider.** You merge the returns, settle conflicts between them, and write the claims register. Workers gather; they do not decide what the report concludes.

## Stop Gathering

Stop when the brief's question can be answered at its rigor: every claim the answer needs has sources at the level it needs, and further reading returns what you already have. More sources do not make a report better once the claims it needs are supported; reading past that point only adds caveats.
