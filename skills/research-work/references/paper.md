# Writing A Paper

This reference is judgment: adapt it to the paper and its venue. Its binding statements restate the Research Work Rules; the paper outline, rebuttal ledger and evidence table formats are a contract in [artifacts](artifacts.md).

Goal: a paper whose one message a result could contradict, whose every number traces to the register, and whose limits are stated once.

## From The Register To An Outline

Start from the claims register, built by a study or, for a paper from existing results, by registering what those results show. The paper makes only the claims the register holds, at their levels. Which claims it makes is the user's choice.

Create the outline with `artifact.mjs init paper-outline` and fill it before prose:

- **The proposition:** the paper's one message, as a sentence a result could contradict. State it at the start of the paper and again at the end. While it is still being found, write `not yet stated`: the outline validates, and review checks the draft.
- **The contributions,** each refutable and each naming the claim IDs that support it. Write them first: they are what the paper must deliver.
- **One sentence per planned paragraph,** with the paragraph's role (the gap, an example, evidence, an objection answered) and the claim IDs it uses. Going further, to each paragraph's key wording, helped in one case; it is not required.
- **Each figure and table,** with the claims it shows and its data file.
- **The objections:** the strongest ones a reader will raise, each with where it is answered. "none found within these searches" is a valid answer; do not invent objections to fill the section.
- **Where the limits go:** one place.

`artifact.mjs validate` checks the outline: every claim ID is in the register its header names, every contribution names one, and every figure's data file exists. Agree the outline and the abstract with the user before the draft. With no project folder yet, `artifact.mjs init project <folder>` lays one out ([artifacts](artifacts.md)). For a paper from a study done elsewhere, replace its skeleton brief and register with the study's own, and bring the locked plan and the result files the register cites, at the same relative paths, so `validate --plan` and `trace --results` still run.

## Figures

Draw each figure from its data file, never from numbers typed in: write a [figure spec](artifacts.md#figure-spec) and run `figure.mjs draw` through `paper.mjs run` (or `study.mjs run` inside a study), with the spec and data as `--input` and the SVG as `--output`. Put the receipt's ID in the outline's Figures row; validation then shows the figure came from that data and that spec as they are now, and a figure redrawn, or a data file or spec changed after it, shows as stale. Declare the spec as an `--input`: a spec the receipt does not record is not checked. It does not show the figure is right: look at the rendered figure against its data before review. A figure drawn with another tool (matplotlib, a project's own script), and a script that turns nested results into a figure's rows, go through the same receipt. A receipt records paths relative to its ledger's folder. Give the spec a `title` and a `description`: they become the SVG's title and alternative text. Caption numbers trace to the register like any paragraph's. A model that looks at the rendered figure may flag a problem for you to check; it never passes one, since no study has measured how well it sees.

## Draft

Write the abstract from the proposition and the contributions, before the body. It holds the proposition, the method, the key numbers with their levels, and the main limit, within the venue's length, fetched at use. Then draft the body from the outline, paragraph by paragraph, from the register as [claims](claims.md#write-the-report-from-the-register) says: each paragraph that states a number cites its claim IDs, and process facts such as the lock and the deviations go in Method and Limits. A paper from a study reports every outcome its plan says to report, its checks and controls included, whether they passed or failed.

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

Run `claims.mjs trace` on the draft against the register, and `sources.mjs cite-check` when it cites code or quotes, as Check The Report says; at publication rigor, check that the key claims' citations support them ([claims](claims.md#check-that-citations-support-claims)). Then run `claims.mjs draft-check <paper.md> --outline <outline.md> --ledger <sources.md>`, with `--limit <section>=<words>` for the venue's limits (`total` counts the level-2 sections other than the abstract, references and acknowledgements, and is reported as not checked when body text also sits under level-1 headings): it fails on an abstract number the body does not state, a `[@S<n>]` citation the ledger lacks, a figure, table or section reference that resolves to nothing, figures numbered out of the order the text first names them, a figure without a valid receipt, and a section over its limit, and, with `--copy S<n>=<saved copy>`, a run of twelve or more words taken from a source without quotation marks; it lists acronyms not defined before use, process words (a round, a rerun, the coordinator), ledger sources the draft never cites, and statements about prior work ("previous studies have shown") that cite no source, for you to read. A listed word is not wrong by itself; when it belongs to the paper (a paper about patches says "patch"), pass it with `--allow`, as for an acronym the field knows. A missing proposition does not block drafting, since writing is often how the message is found, but a draft that still does not state one does not pass review.

Then review the draft once, through Review Work's artifact review, with the register, the outline and the check output beside it. Do not loop the draft against a model judge: iterated rewriting drifts toward generic text (Perez et al.; Ziegenbein et al.), and self-refinement against an evaluator that shares the writer's context drifts from human judgment (Pan et al.). No quota of caveats, limitations score or protected hedge belongs in the review.

## Revise By Patch

Settle the review's findings as Review Work's adjudication says (`review-work/references/adjudication.md`: each one Accepted, Rejected or Open, with its reason), then answer each finding you accept with a change, as a patch to the reviewed draft, not a new draft: a regenerated draft reopens everything the review passed. Anchor the reviewed draft with `paper.mjs anchor` before the review, write the changes as a [patch](artifacts.md#revision-patch), each naming its finding, and apply it with `paper.mjs apply`: it refuses a draft that changed since the anchor and leaves every other block as it was, and its apply report keeps each change beside its finding. Anchor the revised draft again before any further review. A finding that shows a register row is wrong is corrected in the register first, then in the text; one about the study's own records (its plan, its ledgers) goes to the study's owner, not into the paper. A change that states a new claim registers it first; a change to what a paragraph claims updates the outline too. Run the checks again on the revised draft. With `--register <claims.md>`, `apply` also lists wording in the changed blocks that a claim's level may not support, and wording stronger than the reviewed text had ("improves" where it said "is associated with"): the review never saw it, so read it against the register before the next step. The rebuttal ledger below is for the venue's reviewers, not this review.

## References And The Build

Write citations as `[@S3]`, the source-ledger ID, and make the bibliography with `sources.mjs bib <sources.md> --out refs.bib`. Each entry comes from the ledger's pin, with the ledger's Source as its title, so keep Source to a citation's form ("Brown, Cai and DasGupta 2001. Interval estimation for a binomial proportion") or the references read as descriptions; a source whose lookup is not `verified` carries a note saying so and is listed, so it is checked or dropped before submission, never cited as if it were. To get full author and title fields, export the references from a reference manager and pass the file with `--from`: an entry with the same DOI or arXiv ID gives its fields, and the key stays the ledger ID.

Build with `paper.mjs build <paper.md> --to pdf|docx|latex|html --venue --bib refs.bib --ledger <runs.jsonl>`, with the venue's template (`--template`) and citation style (`--csl`) fetched at use and recorded in the source ledger. `--venue` builds from a copy without the claim-ID parentheses, and lists the claim IDs left in running text for you to rewrite. Each command the build runs gets a receipt, and a build that cannot find a figure fails. Word and LaTeX outputs convert SVG figures with `rsvg-convert` when it is installed; without it Pandoc warns and embeds the SVG, which older Word does not show. A PDF needs Pandoc and a LaTeX engine, or `--engine browser` with Chromium or Chrome; when neither is installed the build says so and stops, and nothing is installed for you. Then `paper.mjs check-pdf <paper.pdf> --max-pages <n> --max-words <n> --source <paper.md> --require <section>` checks the built PDF's pages and words (read with poppler's `pdfinfo` and `pdftotext` when installed; the word count includes references, which a venue may count differently) and that the Markdown source has the required sections (data availability, funding); what goes in those sections is the user's.

## Rebuttal

Answer the venue's reviewers in a rebuttal ledger (`artifact.mjs init rebuttal`), one row per comment:

- the comment, quoted;
- your choice, with the reason: **will address** (the paper changes), **won't** (the comment is on point but the paper stays as it is), or **not on point** (the comment is about something the paper does not claim);
- for "will address", the commitment and, before submission, where it was fulfilled (a section or a commit).

In a later round, mark each comment either as continuing an earlier one (`continues R<n>`) or as new (`yes`). A new request in a later round is the goalpost moving: `artifact.mjs validate` lists the rows marked `yes`, so the user decides each one rather than absorbing it unnoticed. The validator cannot judge what a comment asks, so the marking is yours: mark `continues` only a comment that asks for what the earlier one did. Set the ledger's Stage to `submitted` only when every "will address" names where it was done; validation refuses it otherwise. A comment that needs the user's decision stays "will address" with no fulfilment until they answer, so the ledger cannot be submitted before then.

Answer each comment once, with the evidence or the limit it marks. Do not add caveats to the paper only to pre-empt a reviewer.

## A Literature Review

A literature review is research: frame it, search with the search ledger (each hit's state and reason recorded, the counts computed), and register its claims as for any report. A systematic review makes its screening repeatable, each step in the [search ledger](artifacts.md#search-ledger):

- **Criteria before screening.** Write each exclusion criterion, with the stage that can apply it, before the first hit is screened, and cite it on each exclusion. A criterion only the full text can settle (the outcome measured, the design) cannot exclude at the title and abstract; validation refuses that, and the flow counts each criterion's exclusions.
- **A model screener is a judge.** Its decisions count only once a person has screened a sample and its agreement with them passes a judge validation record ([measurement](measurement.md#judges)), which the ledger names, validated on the rubric the ledger names as the instructions the model was given. When two screeners decide the same hits, `artifact.mjs counts` gives their raw agreement, kappa and disagreements; a person settles each disagreement.
- **The flow figure from the ledger.** Write the flow with `artifact.mjs counts --flow` and draw it as a `flow` figure through a receipt, as any figure; its counts are never typed.

For the studies it compares, add an evidence table (`artifact.mjs init evidence-table`): one row per study with its design, n, result, the result that would have refuted it, and its level, capped by how its source was checked. The table goes in the review beside the findings that cite it. For studies of an intervention's effect, add each study's risk-of-bias tool and judgment. A study judged at high risk keeps its level, since the level says what kind of evidence it is and how it was checked, and risk of bias how well it was run; keeping the two apart keeps one scale. A synthesis states its result with and without the high-risk studies, and a finding that holds only with them says so in its Limit.

To combine effect sizes, pool them with `stats.mjs meta` (Numbers From Samples in the skill): random effects, reported with the Hartung-Knapp interval, tau² and I². Pool only studies that estimate the same quantity on the same scale. With I² high, say why the studies differ before relying on the pooled estimate; with fewer than five studies, tau² is rough, and `meta` says so. When the studies agree more closely than their variances predict, the Hartung-Knapp interval is narrower than their evidence; `meta` warns and names the truncated interval to report instead.
