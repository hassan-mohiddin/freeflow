# Reporting: Claims, The Report And The Paper

This reference is judgment about turning findings into claims, the report and a paper: adapt it to the findings, the paper and its venue. Its Formats section is a contract, kept as written, which `artifact.mjs` creates and checks; its binding statements restate the Research Work Rules, and the evidence scale is in [Research Work](../SKILL.md#the-evidence-scale).

Goal: the report says exactly what the evidence supports, once and plainly, and a reader can trace each statement to its source; a paper's one message is one a result could contradict, its every number traces to the register, and its limits are stated once.

## One Claim Per Row

A claim is one statement that could be wrong. A claim about code names the condition that selects the path it describes (the policy, the flag, the platform, the model), or says it holds on every path; a branch read as the whole is the most common error in code reports. Split a sentence that bundles several ("the loop retries twice and logs each failure" is two claims) so each gets its own sources and level. Write the claim in the words the report will use, with every number it states in the Numbers column (`3 of 12`, `0.83 [0.79, 0.86]`), so the trace check can match the report against it.

## Choose The Level

Give each claim the highest level its evidence reaches, and no higher:

- **L1:** you have only someone's statement: a README, a vendor page, a paper's abstract, a search result, a worker's claim you did not check.
- **L2:** you checked it against the primary source: read the code at the pinned commit, opened the paper's method or table, ran a test that asserts it.
- **L3:** you saw it happen, once or in an uncontrolled way: ran the tool and watched its behavior, one case study, an observation in logs.
- **L4:** a controlled comparison at a stated boundary, with its decision rule fixed before the data. Reading or running alone never reaches L4.
- **L5:** it holds across independent replications: other models, tasks, groups or sources found the same.

Then apply the caps the [Claims Register](#claims-register) lists. Every source a row cites caps it, so cite only the sources the claim rests on; a weaker source that only agrees goes in Limit, not Source.

Everything a report finds while reading is `exploratory`.

## Scope And Limit

Every row says where the claim holds (`codex@1a2b3c4, the default config`, `ML-venue BibTeX, 2024`) and what it does not show (`not checked at runtime`, `one benchmark`). This is where the qualification lives, once, so the sentence in the report can be plain.

## Conflicts And Absences

- **Sources disagree:** state each source's exact claim, how each was checked, and which you rely on and why. Prefer the source checked more directly and pinned more exactly; between two at the same level, prefer the more recent version of the same artifact (a later commit, an erratum). Where you cannot settle it, register the conflict itself as the claim ("S3 and S5 disagree on …") and put it in Limits.
- **Several findings feed one conclusion:** the conclusion's level is the lowest level among the findings it needs, not the highest.
- **Nothing found:** an absence is a claim like any other, with the search that looked: "within the agent loop at this commit, no retry path exists (searched `retry`, `backoff`, every caller of `run_turn`)". Without the search, it is not a finding.
- **A worker's claim:** stays at L1 until you checked its citations; then it takes the level of what you checked.

Counter-arguments and caveats are not owed for their own sake. When you looked for evidence against a claim and found none, "none found within these searches" is a complete answer.

## Write The Report From The Register

Write the report in the [Research Report](#research-report) shape, drafted from the register rather than from memory:

- **Answer first,** in plain words, with its level.
- **Each finding cites its claim IDs** (`C3, C4`) and states the claim at its level: L2 as a plain fact, L3 as "we observed", L1 as "X reports". The level replaces hedging; do not attach a qualifier to every sentence.
- **Strength once.** When every finding has the same level, say so once in the Answer. Otherwise give each finding its level where the finding is stated, and nowhere else.
- **Process facts are not claims.** Which checks passed, the deviations and who cleared them, how the plan was locked: these go in Method and Limits, citing the claims they bear on, not in the register.
- **Limits in one place.** Collect the register's limits, the conflicts, what was out of scope and what was not followed into Limits. A limit stated once is honest; the same limit repeated in every section hides the answer.
- **Every number from the register.** Copy numbers from the Numbers column; never retype one from memory. Then run `claims.mjs trace`, which counts every digit outside code (write a design constant in words, or put it in its claim's Numbers) and passes a count about the searches only after its query ID (`Q2`), as [What The Gate Runs](#what-the-gate-runs) says.
- **Recommendations are proposals** for the reader, who decides.

Answer the strongest objection a reader will raise where it arises, once, with the reason: either the evidence that settles it or the limit it marks. Do not add objections no reader would raise.

`claims.mjs trace` lists wording a claim's level may not support: "improves" or "causes" on a claim below L4, improvement beside a negative number, "the latest version" or a "current" claim with no date, version or commit. Rewrite the sentence at the claim's level, or keep it when the level supports it.

## What The Gate Runs

`research.mjs gate` runs each check below that its rigor requires or its file makes possible. A file that is present is always checked, and its failure fails the gate, except a paper's PDF below publication, which no lower rigor requires: its result is shown and holds nothing; a claims register or outline still as `init` wrote it counts as absent. A passed check's notes (what it did not check, or a warning) are printed beneath it: read each one.

| Check | Runs | Required at |
| --- | --- | --- |
| Brief and source ledger: `artifact.mjs validate` | always | every rigor |
| Every source opened or run: no ledger row checked from an `abstract`, a `summary-only` or `memory` | at publication | publication |
| Search ledger: `validate` | when it has lines | — |
| Study plan: `validate`, then `study.mjs check` | when there is a plan; a register with a confirmatory claim and no plan fails, since a confirmatory claim is a study's | — |
| Claims register: `validate --sources`, with `--plan`, `--search` and `--recheck` when they exist | when it is filled in | study, publication |
| Report and paper: `sources.mjs cite-check`; `claims.mjs trace`, with `--results` when there is a plan and `--search` when there is a search ledger | for each one present; cite-check that finds no citation has not run (a paper citing only `[@S<n>]` is checked by draft-check) | cite-check at every rigor; trace when there is a register, and at study and publication |
| Paper: its outline's `validate`; `claims.mjs draft-check` | with a paper | — |
| Citation support: `claims.mjs support-check`, on packets that still match the report and paper; a packet for every claim either cites with a code citation or quote, except those `--unsupported-ok C<n>,...` keeps out by your choice, which it lists as not checked | at publication, or when answers exist | publication |
| PDF: `paper.mjs check-pdf`, against the venue's `--max-pages`, `--max-words` and `--require <section>`; at publication, with none given, it is not checked | when one is built | a paper at publication |

- `artifact.mjs validate` on the register refuses what the [Claims Register](#claims-register) lists, with each option the gate passes it.
- `cite-check` reads each cited file at the commit pinned in the ledger, using a local clone you name, and finds each quote in a saved copy of its source. Anything it could not check, it lists as not checked, never as passed; the gate fails a check with 0 failed and any not checked.
- `trace` lists every number and claim ID in the report that the register does not support. It reads the report by paragraph, list item, table row and heading, and a number passes only when the same one cites the claim it comes from. Every digit outside code counts (one joined by a hyphen to a capitalised name, as in `GPT-4` or `CIFAR-10`, is part of the name), so write a design constant (a grid spacing, a seed) in words or put it in its claim's Numbers. It skips code spans and blocks, so a number the report states belongs outside backticks. With `--search`, a count the report states about its searches (queries, hits, included, excluded) passes when the search ledger computes it: a count after a query ID (`Q2`) for that query, or as the sum over the queries the line names. With `--results`, it also finds each register number in the result file or log its Source names (a JSON file's numeric values only). That shows the number is there, not that the analysis computed it; it passes only with 0 problems and 0 rows not checked.
- `trace` also fails a percentage that does not follow from the counts beside it ("12 of 40 (35%)"), and lists, without failing, wording a claim's level may not support, as [Write The Report From The Register](#write-the-report-from-the-register) says. Read each listed line; a listed word that the claim's level supports stays.

## Check That Citations Support Claims

Goal: each key claim says what its cited lines or passage actually show, conditions included.

A citation can exist, be read, and still not show its claim: the claim drops a condition, widens the scope, or states a number the source does not. Writers miss this in their own work, because they read the source with the claim in mind. So a separate reader, who sees only the claim and its evidence, answers for each:

1. `claims.mjs support <report.md> [<paper.md>] --register <claims.md> --ledger <sources.md> --repo <name>=<clone> --copy S<n>=<saved copy> --out reviews/support-packets.jsonl` writes one packet per claim the report cites with a code citation or a quote: the claim with its numbers, scope and limit, and only its evidence (the cited code with the lines around it and the lines that open its enclosing blocks, so a condition that selects the path shows; or the passage around a quote). A citation counts for the claims cited in its own sentence; a sentence of citations that cites no claim counts for the next sentence's claims when that one has no evidence of its own (`... (S1:path:12). C1, L2.`), and otherwise for the previous sentence's. `--only C3,C7` limits it to the key claims; at publication the gate then names every other claim cited with a code citation or quote, for you to add or keep out with `--unsupported-ok`. Given the paper too, a claim's packet holds what either cites for it. A cited claim with no code citation or quote is listed as not checked: quote the lines it rests on.
2. Give the packets file to a reader in a separate context, by default a different model from the writer's, as Review Work's [Judge Contract](../../review-work/references/evals-and-judges.md#judge-contract) says. Give it nothing else: not the report, not your view of the claim. It writes one answer per packet to a verdicts file (`reviews/support-verdicts.jsonl`, where the gate reads it), in the format [Support Packets And Verdicts](#support-packets-and-verdicts) defines.
3. `claims.mjs support-check <verdicts.jsonl> --packets <packets.jsonl>` finds each answer's quote in its packet and counts the answers, k of n supported, with a Wilson interval.
4. Settle each partial or unsupported answer: correct the claim (its wording, scope or level) or its citation, and build the packets again (the gate refuses packets the report, register and sources no longer give); or, when the evidence shows the reader is wrong, add `"adjudication": "rejected: \"<four or more words of the packet's evidence>\" <why they show it>"` to that answer; a rejection that quotes nothing settles nothing. Report the rate and what was corrected in Method.

At publication rigor, check every claim the answer or the contributions rest on; below it, check the claims a costly decision rests on, or none. The reader's verdicts are not validated against a gold set: they find claims to re-read, and a `supported` answer does not raise a claim's level. The reader sees only what is cited, so a condition in code the claim does not cite stays invisible: cite the line where a value takes the form the claim states (where a flag is finally set, not where it is first assigned).

## From The Register To An Outline

Start from the claims register, built by a study or, for a paper from existing results, by registering what those results show. The paper makes only the claims the register holds, at their levels. Which claims it makes is the user's choice.

Create the outline with `artifact.mjs init paper-outline` and fill it before prose:

- **The proposition:** the paper's one message, as a sentence a result could contradict. State it at the start of the paper and again at the end. While it is still being found, write `not yet stated`: the outline validates, and review checks the draft.
- **The contributions,** each refutable and each naming the claim IDs that support it. Write them first: they are what the paper must deliver.
- **One sentence per planned paragraph,** with the paragraph's role (the gap, an example, evidence, an objection answered) and the claim IDs it uses. Going further, to each paragraph's key wording, helped in one case; it is not required.
- **Each figure and table,** with the claims it shows and its data file.
- **The objections:** the strongest ones a reader will raise, each with where it is answered. "none found within these searches" is a valid answer; do not invent objections to fill the section.
- **Where the limits go:** one place.

`artifact.mjs validate` checks the outline: every claim ID is in the register its header names, every contribution names one, and every figure's data file exists. Agree the outline and the abstract with the user before the draft. With no project folder yet, `artifact.mjs init project <folder>` lays one out ([the layout](evidence.md#formats)). For a paper from a study done elsewhere, replace its skeleton brief and register with the study's own, and bring the locked plan and the result files the register cites, at the same relative paths, so `validate --plan` and `trace --results` still run.

## Figures

Draw each figure from its data file, never from numbers typed in: write a [figure spec](#figure-spec) and run `figure.mjs draw` through `paper.mjs run` (or `study.mjs run` inside a study), with the spec and data as `--input` and the SVG as `--output`. Put the receipt's ID in the outline's Figures row; validation then shows the figure came from that data and that spec as they are now, and a figure redrawn, or a data file or spec changed after it, shows as stale. Declare the spec as an `--input`: a spec the receipt does not record is not checked. It does not show the figure is right: look at the rendered figure against its data before review, and settle each overlap `draw` lists. When nothing here can render an SVG (no `rsvg-convert`, browser or LaTeX), say so in the hand-over: the figure has not been looked at. A figure drawn with another tool (matplotlib, a project's own script), and a script that turns nested results into a figure's rows, go through the same receipt. A receipt records paths relative to its ledger's folder. Give the spec a `title` and a `description`: they become the SVG's title and alternative text. Caption numbers trace to the register like any paragraph's. A model that looks at the rendered figure may flag a problem for you to check; it never passes one, since no study has measured how well it sees.

## Draft

Write the abstract from the proposition and the contributions, before the body. It holds the proposition, the method, the key numbers with their levels, and the main limit, within the venue's length, fetched at use. Then draft the body from the outline, paragraph by paragraph, from the register as [Write The Report From The Register](#write-the-report-from-the-register) says: each paragraph that states a number cites its claim IDs, and process facts such as the lock and the deviations go in Method and Limits. A paper from a study reports every outcome its plan says to report, its checks and controls included, whether they passed or failed.

Each technique below carries its basis: **guide** (established writing guidance agrees), **measured** (a study bears on the failure it prevents), or **one case** (only one paper's drafting supports it). None has been measured on paper quality; treat them as defaults.

| Technique | Basis |
| --- | --- |
| One message, as a proposition a result could contradict, stated at the start and the end; contributions are refutable | Guide: Mensh and Kording rule 1; Peyton Jones |
| The contributions, and from them the register, come first; every number in the draft traces to the register | Guide: Peyton Jones. Measured failure: AI-written papers with hallucinated numbers (Beel et al.; Miyai et al.) |
| An outline before prose, one sentence per planned paragraph | Guide: Mensh and Kording rule 9. Caution: for student term papers, outline-then-develop was among the weaker strategies (Torrance et al., abstract only) |
| An example first, then the general case | Guide: Peyton Jones |
| The gap the paper fills, in the introduction | Guide: Mensh and Kording rule 6 |
| One subject in one place | Guide: Mensh and Kording rule 4 |
| Strength stated once, from the evidence level, with graded words tied to levels | Guide: GRADE's wording ("probably" at moderate certainty, "may" at low). Measured: readers misread verbal probability terms, and a verbal-plus-numeric scale improved their readings (Budescu et al. 2012) |
| The decision rule in Methods, with equivalence bounds so a null result means something | Guide: Lakens (2017), summary only. Measured: Registered Reports report far fewer positive results, 44% against 96% (Scheel et al., summary only) |
| Qualify, don't hedge: state once the conditions under which a claim holds | Guide: Pinker (secondary account). Measured: honest caveats attributed to the scientists raised readers' trust (Jensen 2008), so limits stay, stated once |
| Answer the strongest objections once, where they arise | Measured, outside papers: two-sided messages with refutation persuade better than one-sided ones (Allen 1991, abstract) |
| The abstract drafted from the proposition before the body, re-checked against the register at review | One case |
| Name the open gaps and the next test once, in Limits or Future Work | One case |
| Sentences put old information first and the point at the end | Guide: Gopen and Swan |
| A naive reader tests the draft | Guide: Mensh and Kording rules 2 and 10 |

Disclosing AI use is a separate decision, the user's; it lowered trust in one set of studies (Schilke and Reimann, press release only).

The venue's checklist and template change every year: fetch the current ones at use, record each in the source ledger with its date, and check the draft against the checklist before review. With no venue chosen yet, skip this and say so.

## Check, Then One Review

Run the gate, as Check The Report says: on the draft it runs `claims.mjs trace` against the register and `sources.mjs cite-check`, and at publication rigor it requires the answers that the key claims' citations support them ([Check That Citations Support Claims](#check-that-citations-support-claims)). It also runs `claims.mjs draft-check <paper.md> --outline <outline.md> --ledger <sources.md>`, passing on `--limit <section>=<words>` for the venue's limits (`total` counts the level-2 sections other than the abstract, references and acknowledgements, and is reported as not checked when body text also sits under level-1 headings): it fails on an abstract number the body does not state, a `[@S<n>]` citation the ledger lacks, a figure, table or section reference that resolves to nothing, figures numbered out of the order the text first names them, a figure without a valid receipt, and a section over its limit, and, with `--copy S<n>=<saved copy>`, a run of twelve or more words taken from a source without quotation marks; it lists acronyms not defined before use, process words (a round, a rerun, the coordinator), ledger sources the draft never cites, and statements about prior work ("previous studies have shown") that cite no source, for you to read. A listed word is not wrong by itself; when it belongs to the paper (a paper about patches says "patch"), pass it with `--allow`, as for an acronym the field knows. A missing proposition does not block drafting, since writing is often how the message is found, but a draft that still does not state one does not pass review.

Then review the draft once, through Review Work's artifact review, with the register, the outline and the check output beside it. Do not loop the draft against a model judge: iterated rewriting drifts toward generic text (Perez et al.; Ziegenbein et al.), and self-refinement against an evaluator that shares the writer's context drifts from human judgment (Pan et al.). No quota of caveats, limitations score or protected hedge belongs in the review.

## Revise By Patch

Settle the review's findings as Review Work's adjudication says (`review-work/references/adjudication.md`: each one Accepted, Rejected or Open, with its reason), then answer each finding you accept with a change, as a patch to the reviewed draft, not a new draft: a regenerated draft reopens everything the review passed. Anchor the reviewed draft with `paper.mjs anchor` before the review, write the changes as a [patch](#revision-patch), each naming its finding, and apply it with `paper.mjs apply`: it refuses a draft that changed since the anchor and leaves every other block as it was, and its apply report keeps each change beside its finding. Anchor the revised draft again before any further review. A finding that shows a register row is wrong is corrected in the register first, then in the text; one about the study's own records (its plan, its ledgers) goes to the study's owner, not into the paper. A change that states a new claim registers it first; a change to what a paragraph claims updates the outline too. Run the checks again on the revised draft. With `--register <claims.md>`, `apply` also lists wording in the changed blocks that a claim's level may not support, and wording stronger than the reviewed text had ("improves" where it said "is associated with"): the review never saw it, so read it against the register before the next step. The rebuttal ledger below is for the venue's reviewers, not this review.

## References And The Build

Write citations as `[@S3]`, the source-ledger ID, and make the bibliography with `sources.mjs bib <sources.md> --out refs.bib`. Each entry comes from the ledger's pin, with the ledger's Source as its title, so keep Source to a citation's form ("Brown, Cai and DasGupta 2001. Interval estimation for a binomial proportion") or the references read as descriptions; a source whose lookup is not `verified` carries a note saying so and is listed, so it is checked or dropped before submission, never cited as if it were. To get full author and title fields, pass the lookup cache with `--cache <lookups.json>`, so each verified row gets its record's title, its authors' family names and its year, or export the references from a reference manager and pass the file with `--from`: an entry with the same DOI or arXiv ID gives its fields, and the key stays the ledger ID.

Build with `paper.mjs build <paper.md> --to pdf|docx|latex|html --venue --bib refs.bib --ledger <runs.jsonl>`, with the venue's template (`--template`) and citation style (`--csl`) fetched at use and recorded in the source ledger. `--venue` builds from a copy without the claim-ID parentheses, and lists the claim IDs left in running text for you to rewrite. Each command the build runs gets a receipt, and a build that cannot find a figure fails. Word and LaTeX outputs convert SVG figures with `rsvg-convert` when it is installed; without it Pandoc warns and embeds the SVG, which older Word does not show. A PDF needs Pandoc and a LaTeX engine, or `--engine browser` with Chromium or Chrome; when neither is installed the build says so and stops, and nothing is installed for you. Then `paper.mjs check-pdf <paper.pdf> --max-pages <n> --max-words <n> --source <paper.md> --require <section>`, which the gate runs on `paper/build/paper.pdf` with those options (at publication it requires at least one, the venue's), checks the built PDF's pages and words (read with poppler's `pdfinfo` and `pdftotext` when installed; the word count includes references, which a venue may count differently) and that the Markdown source has the required sections (data availability, funding); what goes in those sections is the user's.

## Rebuttal

Answer the venue's reviewers in a rebuttal ledger (`artifact.mjs init rebuttal`), one row per comment:

- the comment, quoted;
- your choice, with the reason: **will address** (the paper changes), **won't** (the comment is on point but the paper stays as it is), or **not on point** (the comment is about something the paper does not claim);
- for "will address", the commitment and, before submission, where it was fulfilled (a section or a commit).

In a later round, mark each comment either as continuing an earlier one (`continues R<n>`) or as new (`yes`). A new request in a later round is the goalpost moving: `artifact.mjs validate` lists the rows marked `yes`, so the user decides each one rather than absorbing it unnoticed. The validator cannot judge what a comment asks, so the marking is yours: mark `continues` only a comment that asks for what the earlier one did. Set the ledger's Stage to `submitted` only when every "will address" names where it was done; validation refuses it otherwise. A comment that needs the user's decision stays "will address" with no fulfilment until they answer, so the ledger cannot be submitted before then.

Answer each comment once, with the evidence or the limit it marks. Do not add caveats to the paper only to pre-empt a reviewer.

## Formats

This section is a contract: the files below follow it as written. Every format starts with the [header](evidence.md#header); creating and checking them is in [the formats' commands](evidence.md#formats).

### Citations In A Report

A report, a worker's return and the claims register's Source column cite in these forms, which the checks read:

- **Code:** `S<n>:path:line` or `S<n>:path:start-end`, where `S<n>` is a ledger row pinned as `<repository>@<commit>` and the path is relative to the repository root (`S1:codex-rs/core/src/codex.rs:120-145`).
- **A quote:** the quoted words in double quotes followed by the source ID, `"the exact words" (S3)`, or for a repository the file too, `"the exact words" (S1:path)`; the parenthesis may carry more after the source, as `(S3; C2, L3)`. Quote at least four words, copied exactly; the check looks for them in the saved copy of S3, or in the file at the pinned commit, after collapsing whitespace, so a quote may span lines of a saved log. A quote of four or more words in a sentence that names a source in any other form is listed as not checked.
- **Which claim a citation supports:** put the claim's ID in the same sentence as its citations, or in the sentence right after (`... (S1:path:12). C1, L2.`); the support check reads them that way.
- **A claim:** its register ID, `C4`, or several, `C4, C7`, where a finding states it.

### Claims Register

The contract between the stages: every claim a report or paper makes is a row here before any prose states it. One table with these columns, in order:

| Column | Holds |
| --- | --- |
| ID | `C1`, `C2`, … never reused |
| Claim | The claim, in one sentence |
| Numbers | Every number the claim states, with its interval where it has one (`0.83 [0.79, 0.86]`), or `-` |
| Source | Source-ledger IDs, the result files or log lines the numbers come from (`S2; runs/aggregate.json`, `log.txt:40-42`), `judge:<record>` for a claim resting on a judge's verdicts, and `search:Q<n>` for the search a claim of absence rests on; paths are relative to the register |
| Level | `L0` to `L5` on the evidence scale |
| Kind | `confirmatory` (tested by a decision rule fixed before the data) or `exploratory` |
| Scope | Where the claim holds |
| Limit | What it does not show |

- An exploratory claim is at most L3.
- A claim worded as an absence (being first, nothing or nobody having done it, novel, unprecedented, unexplored) cites the search behind it as `search:Q<n>`; validation refuses one that cites none, reading the wording, and with `--search <search ledger>` a query the ledger lacks.
- Validate a register with `--sources <source ledger>`. That check refuses a source ID the ledger lacks, a refuted source, and a level above what the sources' checking allows.
- With `--recheck <recheck table>`, validation refuses a claim above L1 that cites a source with a recheck row computing to `mismatch` or `decision error`, naming the row; a recheck table that does not validate is reported with it, since a row it cannot read caps nothing. A claim that cites the source for something else, or states the recheck's finding, names the row in its Limit (`does not rest on N6`, `states N6's finding`) and is not capped. Source IDs are read as whole entries (`S3`, `S3:path`, the `(S3)` after a quote), so the `S3` in `meta-no-S3.json` is not one.
- Validate a study's register with `--plan <study plan>` too. It refuses a confirmatory claim unless its ID is a confirmatory hypothesis of the plan, the plan is locked as it stands, and no amendment changed that hypothesis after study runs existed; and it refuses an analysis variant the plan lists, or listed in any locked version, that no row's Claim, Scope or Limit names as `variant V<n>`.
- A claim citing `judge:<record>` is at most L1 unless that judge validation record validates and its Result is `pass`; validation checks this whenever a row cites one. When the plan lists a model as `judge` or `annotator`, validation with `--plan` refuses a claim above L1 that cites a result file and neither `judge:<record>` nor `judge:none` (no model's labels feed it).
- With `--plan`, a confirmatory claim whose hypothesis names a `stats.mjs` Method is checked against the result files it cites that hold its numbers (every cited one, when none does): each must record `computed_by` as a part of the Method, and at least one as its last part, the correction when one is listed (`stats.mjs correct holm`; the raw test's file may sit beside it), and a receipt run under the locked plan, with `stats.mjs` as its program or node's script, must have written it as it is now. `stats.mjs --out <file>` writes the result for the receipt to declare.
- `claims.mjs trace --results` finds each number in the Numbers column in the result files the row's Source names, at the precision written (0.83 matches 0.8333; 65% matches 0.65). A row with numbers and no result file is listed as not checked. A saved text copy of a paper (in `sources/`) serves as a result file, for the numbers a review copies from it.

### Research Report

The shape of an in-depth report or a study's report, from a quick answer to a long synthesis. Its header follows the [Header](evidence.md#header), with Type `Research` and the date the evidence was gathered; leave out a section with nothing to say. A quick answer may need only Question, Answer and Evidence.

```markdown
## Question        what is asked, who will use the answer, and the decision or work it serves
## Answer          the answer in plain words, with its evidence level
## Findings        each finding with its claim IDs and its level, most important first
## Evidence        each source: what it shows, and how it was checked
## Method          how the evidence was gathered: scope, searches or runs, what was left out
## Limits          where sources disagree and how that was settled, and what the evidence cannot show
## Open Questions  what is still unknown, and what would settle it
## Implications    what the answer means for the reader's decision
```

- **Answer before evidence.** The reader knows the claim before reading what supports it.
- **State strength once,** as the evidence level, where the finding is stated; keep the limits in Limits. A qualifier repeated in every sentence hides the claim without making it more accurate.
- **Say how each source was checked,** as its source-ledger row records, with the version or date of anything that changes. Never present a source known only from a summary as verified.
- **Recommendations are proposals.** Implications may recommend; the owner decides. A finding becomes a requirement or a decision only through its owner, as any other source does.

[Write The Report From The Register](#write-the-report-from-the-register) says how to write it from the register.

### Paper Outline

Written before a paper's prose ([From The Register To An Outline](#from-the-register-to-an-outline)). The header adds **Register:** the claims register the paper draws on, relative to the outline, and **Runs:** the run ledger holding the figures' receipts (a study's `runs.jsonl` or the paper's own), or `none`. Sections:

- `## Proposition`: one sentence, the paper's message, or `not yet stated` while the message is still being found.
- `## Contributions`: a table `| ID | Contribution | Claims |`; IDs `K1`, `K2`; each row names at least one claim ID.
- `## Paragraphs`: a table `| Section | Paragraph | Role | Claims |`, one row per planned paragraph; Claims lists claim IDs or `-`.
- `## Figures`: a table `| ID | Figure | Claims | Data | File | Receipt |`; IDs `F1`, `F2` for figures and `T1`, `T2` for tables; Data is the data file, relative to the outline, which must exist; File is the figure file (`-` for a table set in the text); Receipt is the run that drew it (`R<n>` in the Runs ledger), or `-` until it is drawn. A paper with no figures says `none` under the heading instead of a table.
- `## Objections`: a table `| Objection | Answered in |`, or `none found within these searches`.
- `## Limits`: where the limits are stated.

Validation refuses an empty proposition, a contribution or figure with no claim ID, a claim ID the register does not have or a register it cannot read, a figure whose data file does not exist, an objection with no answer, and a placeholder left in the header. A filled Receipt must exist in the Runs ledger, have exited 0, and have read the Data file and written the File as they are now, by their hashes (a File that does not exist fails); when the receipt read a figure spec, the spec's data must be the Data file; `claims.mjs draft-check --outline` also refuses a figure with no receipt.

### Rebuttal Ledger

One per review round set, answering a venue's reviewers ([Rebuttal](#rebuttal)). The header adds **Stage:** `drafted` or `submitted`, and **Paper:** the version reviewed. One table:

| Column | Holds |
| --- | --- |
| ID | `R1`, `R2`, … |
| Reviewer | Who wrote the comment |
| Round | 1, 2, … |
| Comment | The comment, quoted |
| Choice | `will address`, `won't` or `not on point` |
| Reason | Why |
| Commitment | What you commit to; `-` unless the choice is `will address` |
| Fulfilled | Where the commitment was done (a section or a commit), or `-` |
| New | `-` in round 1; later, `yes` for a request the earlier round did not make, or `continues R<n>` naming that reviewer's earlier comment |

Validation refuses a missing choice or reason, a "will address" without a commitment, a later-round comment that is neither new nor continues an earlier comment of the same reviewer, and, at Stage `submitted`, a commitment with no Fulfilled. It lists the new requests.

### Support Packets And Verdicts

`claims.mjs support` writes the packets, one JSON object per line: `packet` (`P1`, …), `claim` (its register ID), `statement`, `numbers`, `scope` and `limit` from the register, `evidence` (each with `cite`, `text` and a `note` saying what the text is; code lines carry their line numbers, the cited ones marked `>`, and the lines that open the enclosing blocks come first, before a `...` line; a range longer than 200 lines is cut, and `cut` names the lines not shown), `unread` (citations whose text could not be read, with why) and `question`, the same for every packet. Never edit a packet; build them again.

The reader writes the verdicts, one JSON object per line:

```json
{"packet":"P1","verdict":"partial","quote":"if policy.allow_retry and attempts < 2","missing":"the retry happens only when the policy allows it"}
```

- `verdict` is `supported`, `partial` (the evidence shows part of the claim, or only under a condition the claim leaves out) or `unsupported`.
- `quote` is at least four words of the packet's evidence, copied exactly (without line numbers).
- `missing` says what the evidence does not show; required for `partial` and `unsupported`.
- `adjudication` is added by the author only: `rejected: "<four or more words of the packet's evidence>" <reason>` for an answer the evidence shows to be wrong.

`claims.mjs support-check` refuses an answer naming no packet, a packet answered twice or not at all, a verdict outside the list, a quote under four words or not in that packet's evidence, a partial or unsupported answer without `missing`, and a rejection whose quote is under four words or not in the packet's evidence. It passes when every packet has a valid answer and every partial or unsupported answer is settled.

### Figure Spec

The JSON that [figure](../scripts/figure.mjs) draws an SVG from: `node figure.mjs draw <spec.json> --out <figure.svg>`. Draw it through `paper.mjs run` or `study.mjs run`, with the spec and data as inputs and the SVG as output, so its receipt can go in the outline.

| Field | Holds |
| --- | --- |
| `type` | `line`, `points`, `bar` (categories on x) or `scatter`; or `flow`, below |
| `data` | The data file, relative to the spec: a JSON array of rows (at the dotted path `rows` names inside the file, when given), JSONL, or CSV with a header row. Values typed into the spec are refused |
| `series` | One entry per series: `label`, the `x` and `y` columns, optional `low` and `high` columns for an interval, optional `where` (column values a row must have) |
| `x`, `y` | Optional `label`, `min` and `max` for each axis; `x.rotate` (`45` or `90`) turns long category labels. `draw` lists, without failing, x labels that overlap and text past the canvas |
| `title`, `description`, `reference`, `width`, `height` | Optional: a title and a description, written into the SVG as its title and alternative text; reference lines `[{ "y": 0.95, "label": "nominal" }]`; the size in pixels (640 by 400) |

The output is the same bytes for the same spec and data. Colors follow Okabe and Ito's palette, with a different marker per series.

A review's flow is a spec of `type` `flow` whose `data` is the file `counts --flow` wrote, with only `title`, `description` and `width` beside them. It draws the steps down the left (identified, by database and by other method; screened, with how many the reviewing agent screened alone; full texts assessed; included) and what leaves at each step to the right (records returned but not screened, duplicates, those awaiting screening, the exclusions with their reasons), and refuses a flow whose counts do not add up, that names no ledger, whose ledger has changed since (its sha256 differs), or that differs from the flow recomputed from that ledger, so a count edited by hand, even with every sum kept, is refused. Run `counts --flow` through the same receipt route, with the ledger as input.

### Revision Patch

`paper.mjs anchor <draft.md>` writes `<draft>.blocks.json`: the draft's sha256 and its blocks (runs of non-blank lines, each top-level list item its own block, a fenced code block kept whole), each with an ID `B1`, `B2`…, its lines, sha256 and first words. A patch is JSON:

```json
{
  "base_sha256": "<the anchored draft's sha256, from the manifest>",
  "changes": [{ "block": "B12", "finding": "R7:3", "op": "replace", "text": "The revised paragraph." }]
}
```

`op` is `replace`, `delete` or `insert-after`; `finding` names the review finding the change answers, as the review report numbers it (`R7:3`); apply checks only that one is named. `paper.mjs apply` refuses a patch whose `base_sha256` is not the anchored draft's, a draft that changed since it was anchored, `--out` naming the draft itself, a block the manifest lacks, a change without a finding, and two edits of one block; it writes the revised draft and `<revised>.apply.json`, the base and result hashes and each change with its finding.
