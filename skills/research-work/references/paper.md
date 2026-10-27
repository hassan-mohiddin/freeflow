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

`artifact.mjs validate` checks the outline: every claim ID is in the register its header names, every contribution names one, and every figure's data file exists. Agree the outline and the abstract with the user before the draft.

## Draft

Write the abstract from the proposition and the contributions, before the body. Then draft the body from the outline, paragraph by paragraph, from the register as [claims](claims.md#write-the-report-from-the-register) says: each paragraph that states a number cites its claim IDs, and process facts such as the lock and the deviations go in Method and Limits. A paper from a study reports every outcome its plan says to report, its checks and controls included, whether they passed or failed.

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

Run `claims.mjs trace` on the draft against the register, and `sources.mjs cite-check` when it cites code or quotes, as Check The Report says. A missing proposition does not block drafting, since writing is often how the message is found, but a draft that still does not state one does not pass review.

Then review the draft once, through Review Work's artifact review, with the register, the outline and the check output beside it. Do not loop the draft against a model judge: iterated rewriting drifts toward generic text (Perez et al.; Ziegenbein et al.), and self-refinement against an evaluator that shares the writer's context drifts from human judgment (Pan et al.). No quota of caveats, limitations score or protected hedge belongs in the review.

## Revise By Patch

Settle the review's findings as Review Work's adjudication says, then answer each finding you accept with a change, as a patch to the reviewed draft, not a new draft: a regenerated draft reopens everything the review passed. Keep the reviewed version, and name in the adjudication the finding each change answers. A change that states a new claim registers it first; a change to what a paragraph claims updates the outline too. Run the checks again on the revised draft. The rebuttal ledger below is for the venue's reviewers, not this review.

## Rebuttal

Answer the venue's reviewers in a rebuttal ledger (`artifact.mjs init rebuttal`), one row per comment:

- the comment, quoted;
- your choice, with the reason: **will address** (the paper changes), **won't** (the comment is on point but the paper stays as it is), or **not on point** (the comment is about something the paper does not claim);
- for "will address", the commitment and, before submission, where it was fulfilled (a section or a commit).

In a later round, mark each comment either as continuing an earlier one (`continues R<n>`) or as new (`yes`). A new request in a later round is the goalpost moving: `artifact.mjs validate` lists the rows marked `yes`, so the user decides each one rather than absorbing it unnoticed. The validator cannot judge what a comment asks, so the marking is yours: mark `continues` only a comment that asks for what the earlier one did. Set the ledger's Stage to `submitted` only when every "will address" names where it was done; validation refuses it otherwise. A comment that needs the user's decision stays "will address" with no fulfilment until they answer, so the ledger cannot be submitted before then.

Answer each comment once, with the evidence or the limit it marks. Do not add caveats to the paper only to pre-empt a reviewer.

## A Literature Review

A literature review is research: frame it, search and screen with the search ledger (each hit's state and reason recorded, the counts computed), and register its claims as for any report. For the studies it compares, add an evidence table (`artifact.mjs init evidence-table`): one row per study with its design, n, result, the result that would have refuted it, and its level, capped by how its source was checked. The table goes in the review beside the findings that cite it.
