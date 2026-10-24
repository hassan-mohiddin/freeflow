// The routing cases: natural requests a user might make in the shelf project (fixtures/shelf), each with the skill
// whose hit rate it counts toward (`hit`), the skills whose opening counts as the right route (`expect`, any of them;
// empty when no skill is needed), and the skills that must not open (`not`: a near miss for each). A hit case for one
// skill is often the near miss of its neighbour (a commit request must not open Finish Branch), so the same case can
// serve both. Workflow's cases accept Agree Work and Execute Work too: they are the skills a change to code reaches,
// with or without Workflow, so before and after the Workflow removal measure the same route. `route` (optional) names
// skills of a merged build that also do the request's job without counting toward its hit (a code change is Execute
// Work's job on v0.9.0); see routeCase.
//
// A case may also name the references and scripts its moment calls for (`parts`, paths under skills/), where its
// skill's routing table names that moment: the report grades each one as used or not, beside the skill.

// Skills the suite still measures although Freeflow has removed them, each with the skill that took over its job
// (null: none did). The suite runs on the pinned base, where they exist, and again on later builds, so before and
// after compare the same requests. On a build without a skill, routeCase counts its owner in its place.
export const MERGED = {
  "action-selection": null,
  "agree-work": "discuss-work",
  bypass: "discuss-work",
  "commit-work": "deliver-work",
  "design-for-depth": "execute-work",
  "diagnose-failure": "execute-work",
  discuss: "discuss-work",
  "finish-branch": "deliver-work",
  handoff: "track-work",
  "launch-work": "deliver-work",
  "map-features": "verify-work",
  "migration-work": "execute-work",
  "release-work": "deliver-work",
  "simplify-code": "execute-work",
  workflow: "execute-work",
  "write-plan": "write-docs",
  "write-spec": "write-docs",
};
export const RETIRED = Object.keys(MERGED);

// References that became sections of another file, and the Map Features skill whose body became Verify Work's feature
// map reference: reading the old file on an earlier build counts as using the file that holds its text now.
export const MOVED_PARTS = {
  "deliver-work/references/push.md": "deliver-work/references/branch-closeout.md",
  "execute-work/references/design-state-and-failure.md": "execute-work/references/design.md",
  "map-features/SKILL.md": "verify-work/references/feature-map.md",
  "map-features/references/driving-surfaces.md": "verify-work/references/feature-map.md",
  "verify-work/references/driving-surfaces.md": "verify-work/references/feature-map.md",
  "write-docs/references/decision-records.md": "write-docs/references/spec-and-plan-shapes.md",
};

/** Every skill Freeflow shipped to the model at the pinned base (1a21211c): the skills the suite's cases name. */
export const SKILLS = [
  "action-selection",
  "agree-work",
  "bypass",
  "commit-work",
  "design-for-depth",
  "diagnose-failure",
  "discuss",
  "evaluate-behavior",
  "execute-work",
  "finish-branch",
  "handoff",
  "launch-work",
  "map-features",
  "migration-work",
  "release-work",
  "review-work",
  "setup-freeflow",
  "simplify-code",
  "track-work",
  "verify-work",
  "workflow",
  "write-docs",
  "write-plan",
  "write-skill",
  "write-spec",
];

const BUILD = ["workflow", "agree-work", "execute-work"];

export const CASES = [
  // Action Selection: a search, read or command whose target, scope or output size is unclear.
  {
    id: "as-log-size",
    hit: "action-selection",
    expect: ["action-selection"],
    not: [],
    prompt:
      "Something made requests slow on the afternoon of the 20th. The server log from that day is in logs/. What does it say happened?",
  },
  {
    id: "as-find-dates",
    hit: "action-selection",
    expect: ["action-selection"],
    not: [],
    prompt: "Where does this codebase deal with dates or timestamps? I want every place listed.",
  },
  {
    id: "as-env-var",
    hit: "action-selection",
    expect: ["action-selection"],
    not: [],
    prompt:
      "Somewhere shelf reads an environment variable that decides where the data lives, but I can't remember its name or where it's read. Find it.",
  },
  {
    id: "nm-as-obvious",
    hit: null,
    expect: [],
    not: ["action-selection"],
    prompt: "Show me what's in package.json.",
  },

  // Agree Work: before building or changing behavior.
  {
    id: "aw-limit-flag",
    hit: "agree-work",
    expect: ["agree-work"],
    not: ["simplify-code"],
    route: ["execute-work"],
    prompt: "Add a --limit option to `shelf list` so I can see just the newest few bookmarks.",
  },
  {
    id: "aw-no-duplicates",
    hit: "agree-work",
    expect: ["agree-work"],
    not: [],
    prompt:
      "When I add a URL that's already on my shelf, it just adds it a second time. Make `shelf add` stop doing that.",
  },
  {
    id: "aw-archive",
    hit: "agree-work",
    expect: ["agree-work"],
    not: [],
    prompt:
      "I'd like to be able to archive bookmarks, so they stop showing up in the list but aren't deleted. Can you build that?",
  },
  {
    id: "nm-aw-question",
    hit: null,
    expect: [],
    not: ["agree-work", "execute-work"],
    prompt: "How does `shelf search` decide which bookmarks match?",
  },
  {
    id: "nm-aw-exact",
    hit: null,
    expect: [],
    not: ["agree-work"],
    prompt: "In README.md, change the heading `## Usage` to `## Using shelf`. Nothing else.",
  },

  // Bypass: the user explicitly asks to skip or lighten Freeflow's optional steps.
  {
    id: "by-skip-plan",
    hit: "bypass",
    expect: ["bypass"],
    not: [],
    prompt:
      "Quick one, no plan and no review needed: rename the fmtDate helper in src/format.js to formatDate and update its uses.",
  },
  {
    id: "by-just-bump",
    hit: "bypass",
    expect: ["bypass"],
    not: [],
    prompt: "Skip the usual agreement and checks for this one and just bump the version in package.json to 1.4.1.",
  },
  {
    id: "by-light-session",
    hit: "bypass",
    expect: ["bypass"],
    not: [],
    prompt:
      "Keep the process light for the rest of this session: no task records, no reviews, just small fixes as I ask for them. First one: fix the typo 'recieve' in README.md.",
  },
  {
    id: "nm-by-urgent",
    hit: null,
    expect: [],
    not: ["bypass"],
    route: ["discuss-work", "execute-work"],
    prompt: "This is urgent: the CSV export breaks when a title has a comma in it. Please fix it.",
  },

  // Commit Work: an explicitly requested local commit.
  {
    id: "cw-commit-tsv",
    hit: "commit-work",
    expect: ["commit-work"],
    not: ["finish-branch"],
    parts: ["deliver-work/scripts/delivery-state.mjs"],
    prompt: "Commit the TSV export work I did (src/export.js and its test) with a good message.",
  },
  {
    id: "cw-commit-all",
    hit: "commit-work",
    expect: ["commit-work"],
    not: [],
    parts: ["deliver-work/scripts/delivery-state.mjs"],
    prompt: "Please commit what's currently changed in the working tree.",
  },
  {
    id: "cw-commit-push",
    hit: "commit-work",
    expect: ["commit-work"],
    not: ["release-work"],
    parts: ["deliver-work/scripts/delivery-state.mjs", "deliver-work/references/branch-closeout.md"],
    prompt: "Commit the export changes and push them.",
  },

  // Design For Depth: structure choices that could make the code harder to change later.
  {
    id: "dd-backends",
    hit: "design-for-depth",
    expect: ["design-for-depth"],
    not: ["migration-work"],
    parts: ["execute-work/references/design.md"],
    prompt:
      "Later I want shelf to be able to keep bookmarks in SQLite as well as the JSON file. How should the storage code be structured so a second backend is easy to add? Work out the design before changing anything.",
  },
  {
    id: "dd-exporters",
    hit: "design-for-depth",
    expect: ["design-for-depth"],
    not: [],
    parts: ["execute-work/references/design.md"],
    prompt:
      "Export formats are one big switch in src/export.js. Restructure it so a new format can be added without touching the core, and design the interface first.",
  },
  {
    id: "dd-errors",
    hit: "design-for-depth",
    expect: ["design-for-depth"],
    not: [],
    parts: ["execute-work/references/design.md"],
    prompt:
      "Errors are handled differently all over this codebase: some functions throw, some print and exit, some return nothing. Design one consistent way to handle errors.",
  },
  {
    id: "nm-dd-local",
    hit: null,
    expect: [],
    not: ["design-for-depth"],
    route: ["execute-work"],
    prompt: "In src/format.js, the variable x in padTitle needs a clearer name. Rename it.",
  },

  // Diagnose Failure: a failure whose cause is not known.
  {
    id: "df-cafe",
    hit: "diagnose-failure",
    expect: ["diagnose-failure"],
    not: [],
    parts: ["execute-work/references/diagnose.md"],
    prompt: "Searching for 'cafe' no longer finds my bookmark 'Café Culture in Vienna', but it used to. Why?",
  },
  {
    id: "df-test-fails",
    hit: "diagnose-failure",
    expect: ["diagnose-failure"],
    not: [],
    parts: ["execute-work/references/diagnose.md"],
    prompt:
      "npm test fails in test/store.test.js and I have no idea why. Can you find out what's going on before anyone changes the test?",
  },
  {
    id: "df-slow-list",
    hit: "diagnose-failure",
    expect: ["diagnose-failure"],
    not: [],
    parts: ["execute-work/references/diagnose.md"],
    prompt:
      "For people with big shelves, the list page of `shelf serve` takes seconds to load. Something is slow and I don't know what.",
  },
  {
    id: "nm-df-known-cause",
    hit: null,
    expect: [],
    not: ["diagnose-failure"],
    route: ["execute-work"],
    prompt:
      "The CSV export doesn't quote fields, so a title with a comma breaks the row. Add proper CSV quoting in src/export.js.",
  },

  // Discuss: exploring what to accomplish or how to approach it.
  {
    id: "di-tags-or-folders",
    hit: "discuss",
    expect: ["discuss"],
    not: [],
    prompt:
      "I'm torn between adding folders and making tags better for organizing bookmarks. What do you think? Let's talk it through before deciding anything.",
  },
  {
    id: "di-sync",
    hit: "discuss",
    expect: ["discuss"],
    not: [],
    prompt:
      "I keep thinking about syncing my shelf between my laptop and my phone, but I'm not sure what approach makes sense. Can we explore the options?",
  },
  {
    id: "di-revisit-plan",
    hit: "discuss",
    expect: ["discuss"],
    not: [],
    prompt:
      "Reading docs/PLAN-tags.md again, I'm not sure renaming tags is the right goal at all. Let's step back and reconsider what problem we're solving.",
  },
  {
    id: "nm-di-decided",
    hit: null,
    expect: [],
    not: ["discuss"],
    route: ["discuss-work", "execute-work"],
    prompt:
      "We've decided on folders. Add a `folder` field to bookmarks and a --folder option to `shelf add` and `shelf list`.",
  },

  // Evaluate Behavior: testing or comparing how an agent behaves.
  {
    id: "eb-agents-rule",
    hit: "evaluate-behavior",
    expect: ["evaluate-behavior"],
    not: [],
    parts: ["evaluate-behavior/references/design-and-measurement.md"],
    prompt:
      "AGENTS.md tells agents to run npm test before saying a change works. How can I test whether coding agents actually follow that? Set up an evaluation.",
  },
  {
    id: "eb-compare-models",
    hit: "evaluate-behavior",
    expect: ["evaluate-behavior"],
    not: [],
    parts: ["evaluate-behavior/references/design-and-measurement.md"],
    prompt:
      "I want to compare how a small model and a large model handle fixing the CSV quoting bug in this repo, with numbers rather than anecdotes. How do we do that?",
  },
  {
    id: "eb-wording",
    hit: "evaluate-behavior",
    expect: ["evaluate-behavior"],
    not: [],
    parts: ["evaluate-behavior/references/design-and-measurement.md"],
    prompt:
      "If I reword the changelog rule in AGENTS.md, will agents follow it more often? I want to measure the old wording against a new one.",
  },

  // Execute Work: carrying out approved work that changes files.
  {
    id: "ew-plan-step-2",
    hit: "execute-work",
    expect: ["execute-work"],
    not: ["write-plan"],
    parts: ["execute-work/scripts/touch-map.mjs", "execute-work/scripts/self-review.mjs"],
    prompt: "The tags plan in docs/PLAN-tags.md is agreed. Go ahead and implement step 2.",
  },
  {
    id: "ew-agreed-json",
    hit: "execute-work",
    expect: ["execute-work"],
    not: [],
    parts: ["execute-work/scripts/touch-map.mjs", "execute-work/scripts/self-review.mjs"],
    prompt:
      "As we agreed yesterday: make `shelf list --json` print one JSON array instead of one object per line, and update the test. Go ahead.",
  },
  {
    id: "ew-lint-script",
    hit: "execute-work",
    expect: ["execute-work"],
    not: [],
    parts: ["execute-work/scripts/touch-map.mjs", "execute-work/scripts/self-review.mjs"],
    prompt:
      "Add a lint script to package.json that runs `node --check` on every file in src/ and bin/, and make sure it passes.",
  },
  {
    id: "nm-ew-explain",
    hit: null,
    expect: [],
    not: ["execute-work"],
    prompt: "Explain what src/server.js does.",
  },

  // Finish Branch: what to do with work on a branch.
  {
    id: "fb-done",
    hit: "finish-branch",
    expect: ["finish-branch"],
    not: [],
    parts: ["deliver-work/references/branch-closeout.md"],
    prompt: "I'm done with the feature/tag-rename branch. What should we do with it now? Merge it?",
  },
  {
    id: "fb-pull-request",
    hit: "finish-branch",
    expect: ["finish-branch"],
    not: ["commit-work"],
    parts: ["deliver-work/scripts/delivery-state.mjs", "deliver-work/references/branch-closeout.md"],
    prompt: "Open a pull request for the tag-rename branch.",
  },
  {
    id: "fb-abandon",
    hit: "finish-branch",
    expect: ["finish-branch"],
    not: [],
    parts: ["deliver-work/references/branch-closeout.md"],
    prompt: "I don't think the tag-rename branch is worth finishing. Should we throw it away or park it somewhere?",
  },

  // Handoff: work continued later or by someone else.
  {
    id: "ho-stop-today",
    hit: "handoff",
    expect: ["handoff"],
    not: [],
    parts: ["track-work/references/handoff.md"],
    prompt:
      "I have to stop for today. Write things up so I, or someone else, can pick up the tag-rename work tomorrow.",
  },
  {
    id: "ho-colleague",
    hit: "handoff",
    expect: ["handoff"],
    not: [],
    parts: ["track-work/references/handoff.md"],
    prompt: "My colleague Priya is taking over the tag-rename work from here. Prepare what she needs to continue.",
  },
  {
    id: "ho-new-session",
    hit: "handoff",
    expect: ["handoff"],
    not: [],
    parts: ["track-work/references/handoff.md"],
    prompt: "This session is getting long. Let's move the tag-rename work to a fresh session; prepare the handover.",
  },
  {
    id: "nm-ho-summary",
    hit: null,
    expect: [],
    not: ["handoff", "track-work"],
    prompt: "Summarize what changed on this branch compared to main.",
  },

  // Launch Work: production deployment, rollout, rollback or restore.
  {
    id: "lw-deploy",
    hit: "launch-work",
    expect: ["launch-work"],
    not: ["release-work"],
    parts: ["deliver-work/references/launch.md"],
    prompt: "Deploy the current version of shelf to production.",
  },
  {
    id: "lw-rollback",
    hit: "launch-work",
    expect: ["launch-work"],
    not: [],
    parts: ["deliver-work/references/launch.md"],
    prompt: "Production has been broken since this morning's deploy: users get 500s on the list page. Roll it back.",
  },
  {
    id: "lw-restore",
    hit: "launch-work",
    expect: ["launch-work"],
    not: [],
    parts: ["deliver-work/references/launch.md"],
    prompt:
      "Yesterday's failed release wiped the production data volume. We need to get the service back from last night's snapshot; docs/deploy.md says how it's set up.",
  },

  // Map Features: a saved, tested way to check the software live.
  {
    id: "mf-setup",
    hit: "map-features",
    expect: ["map-features"],
    not: [],
    parts: ["verify-work/references/feature-map.md"],
    prompt:
      "I want a repeatable way to check that shelf really works end to end: start it and try each feature the way a user would. Set that up so we can rerun it.",
  },
  {
    id: "mf-before-releases",
    hit: "map-features",
    expect: ["map-features"],
    not: [],
    parts: ["verify-work/references/feature-map.md"],
    prompt:
      "Before each release I click through the web view and try the CLI commands by hand. Turn that into saved steps we can run every time.",
  },
  {
    id: "mf-live-checks",
    hit: "map-features",
    expect: ["map-features"],
    not: [],
    parts: ["verify-work/references/feature-map.md"],
    prompt:
      "We have unit tests but nothing that checks the running app. Create live checks for the CLI and the web view, written down so future changes can be checked the same way.",
  },

  // Migration Work: moving something in use, with users' data, to a new implementation.
  {
    id: "mg-sqlite",
    hit: "migration-work",
    expect: ["migration-work"],
    not: [],
    parts: ["execute-work/references/migration.md"],
    prompt:
      "Move bookmark storage from the JSON file to SQLite. People already have years of bookmarks in their JSON files, and nobody can lose any.",
  },
  {
    id: "mg-tags-array",
    hit: "migration-work",
    expect: ["migration-work"],
    not: [],
    parts: ["execute-work/references/migration.md"],
    prompt:
      "Tags are stored as a comma-separated string. Change them to a real array, and make sure every existing user's bookmarks.json still loads afterwards.",
  },
  {
    id: "mg-hosting",
    hit: "migration-work",
    expect: ["migration-work"],
    not: [],
    parts: ["execute-work/references/migration.md"],
    prompt:
      "We're moving the hosted web view off fly.io onto our own server next week, without losing anyone's data or taking it down. Prepare the move.",
  },
  {
    id: "nm-mg-notes",
    hit: null,
    expect: [],
    not: ["migration-work"],
    route: ["execute-work"],
    prompt: "Add an optional notes field that people can set on new bookmarks with --notes.",
  },

  // Release Work: preparing, publishing or verifying a versioned release.
  {
    id: "rw-cut",
    hit: "release-work",
    expect: ["release-work"],
    not: ["launch-work"],
    parts: ["deliver-work/references/release.md"],
    prompt: "Cut the 1.5.0 release: update the version and the changelog, and tag it.",
  },
  {
    id: "rw-prepare",
    hit: "release-work",
    expect: ["release-work"],
    not: [],
    parts: ["deliver-work/references/release.md"],
    prompt: "Get things ready for the next release. What should the version number be, and what goes in the changelog?",
  },
  {
    id: "rw-verify-published",
    hit: "release-work",
    expect: ["release-work"],
    not: [],
    parts: ["deliver-work/references/release.md"],
    prompt: "We published shelf 1.4.0 to npm yesterday. Check that the published package is actually right.",
  },

  // Review Work: judging whether finished work or a guiding document is right and complete enough.
  {
    id: "rv-branch",
    hit: "review-work",
    expect: ["review-work"],
    not: ["verify-work"],
    parts: ["review-work/references/work.md"],
    prompt: "Review the changes on the tag-rename branch before I merge them.",
  },
  {
    id: "rv-plan",
    hit: "review-work",
    expect: ["review-work"],
    not: ["verify-work", "write-plan"],
    parts: ["review-work/references/artifact.md"],
    prompt: "Take a critical look at docs/PLAN-tags.md. Is it complete enough to build from?",
  },
  {
    id: "rv-tsv-change",
    hit: "review-work",
    expect: ["review-work"],
    not: [],
    parts: ["review-work/references/work.md"],
    prompt: "A teammate wrote the TSV export that's sitting uncommitted in src/export.js. Review it for me.",
  },

  // Setup Freeflow: activating Freeflow, repairing its configuration, checking it is delivered.
  {
    id: "sf-activate",
    hit: "setup-freeflow",
    expect: ["setup-freeflow"],
    not: [],
    prompt: "Turn on Freeflow for this repository.",
  },
  {
    id: "sf-loaded",
    hit: "setup-freeflow",
    expect: ["setup-freeflow"],
    not: [],
    prompt: "Is Freeflow actually loaded in this session? Check that its context is being delivered.",
  },
  {
    id: "sf-repair",
    hit: "setup-freeflow",
    expect: ["setup-freeflow"],
    not: [],
    prompt: "My Freeflow settings in .freeflow/ don't seem to take effect. Fix the configuration.",
  },
  {
    id: "nm-sf-app-setting",
    hit: null,
    expect: [],
    not: ["setup-freeflow"],
    prompt: "Make shelf keep its data in ~/Documents/shelf by default instead of ~/.shelf.",
  },

  // Simplify Code: refactoring working code without changing behavior.
  {
    id: "sc-format",
    hit: "simplify-code",
    expect: ["simplify-code"],
    not: [],
    parts: ["execute-work/references/simplify.md"],
    prompt: "src/format.js works, but it's a mess. Clean it up without changing what it prints.",
  },
  {
    id: "sc-duplicate",
    hit: "simplify-code",
    expect: ["simplify-code"],
    not: [],
    parts: ["execute-work/references/simplify.md"],
    prompt:
      "URL normalizing is duplicated in src/store.js and src/search.js. Refactor it into one place; behavior stays the same.",
  },
  {
    id: "sc-cli-args",
    hit: "simplify-code",
    expect: ["simplify-code"],
    not: [],
    parts: ["execute-work/references/simplify.md"],
    prompt:
      "The argument parsing in bin/shelf.js is far more complicated than it needs to be. Simplify it, keeping the behavior identical.",
  },
  {
    id: "nm-sc-feature",
    hit: null,
    expect: [],
    not: ["simplify-code"],
    route: ["execute-work"],
    prompt: "Make `shelf list` show each bookmark's tags as a column, in src/format.js.",
  },

  // Track Work: task memory that outlasts the conversation.
  {
    id: "tw-start",
    hit: "track-work",
    expect: ["track-work"],
    not: [],
    parts: ["track-work/scripts/working-record.mjs"],
    prompt:
      "The tag-rename work will take a few days across several sessions. Start a working record for it so nothing gets lost.",
  },
  {
    id: "tw-recover",
    hit: "track-work",
    expect: ["track-work"],
    not: [],
    parts: ["track-work/scripts/working-record.mjs"],
    prompt: "I'm back after a week away. Where did we leave the tag-rename work? Pick it up from the task record.",
  },
  {
    id: "tw-update",
    hit: "track-work",
    expect: ["track-work"],
    not: [],
    parts: ["track-work/scripts/working-record.mjs"],
    prompt:
      "Put it in the task record: we decided tags are case-insensitive, and step 2 of the plan is what comes next.",
  },
  {
    id: "nm-tw-todo",
    hit: null,
    expect: [],
    not: ["track-work"],
    prompt: "Add a TODO comment in src/store.js saying that saving has no file locking yet.",
  },

  // Verify Work: checking whether work or a claim holds by running it.
  {
    id: "vw-tests",
    hit: "verify-work",
    expect: ["verify-work"],
    not: ["evaluate-behavior"],
    prompt: "Run the test suite and tell me whether everything passes.",
  },
  {
    id: "vw-claim",
    hit: "verify-work",
    expect: ["verify-work"],
    not: ["review-work"],
    prompt: "My colleague says the uncommitted TSV export works. Is that actually true? Check it.",
  },
  {
    id: "vw-serve",
    hit: "verify-work",
    expect: ["verify-work"],
    not: ["map-features"],
    parts: ["verify-work/references/runtime-evidence.md"],
    prompt:
      "Start `shelf serve` with SHELF_HOME pointing at a copy of data/sample.json and check that the list page shows all the sample bookmarks.",
  },

  // Workflow: work that changes code or takes more than one step. Agree Work and Execute Work count too (see top).
  {
    id: "wf-fix-and-test",
    hit: "workflow",
    expect: BUILD,
    not: [],
    parts: [
      "execute-work/scripts/touch-map.mjs",
      "execute-work/scripts/self-review.mjs",
      "verify-work/references/test-design.md",
    ],
    prompt: "Make the CSV export quote titles that contain commas, and add a test for it.",
  },
  {
    id: "wf-import",
    hit: "workflow",
    expect: BUILD,
    not: [],
    parts: ["execute-work/scripts/touch-map.mjs", "execute-work/scripts/self-review.mjs"],
    prompt:
      "Add an import command that reads a browser's exported bookmarks HTML file into the shelf, then document it in the README.",
  },
  {
    id: "wf-rename-data",
    hit: "workflow",
    expect: BUILD,
    not: [],
    parts: ["execute-work/scripts/touch-map.mjs", "execute-work/scripts/self-review.mjs"],
    prompt: "Rename the data/ folder to fixtures/ and update everything that refers to it.",
  },
  {
    id: "nm-wf-question",
    hit: null,
    expect: [],
    not: ["workflow", "agree-work"],
    prompt: "What does `shelf list --json` print?",
  },

  // Write Docs: documentation of how existing software works.
  {
    id: "wd-architecture",
    hit: "write-docs",
    expect: ["write-docs"],
    not: [],
    parts: ["write-docs/references/documentation-shapes.md", "write-docs/scripts/docs-check.mjs"],
    prompt:
      "New contributors keep asking how shelf is put together. Write developer docs explaining how storage, search, export and the web view fit together.",
  },
  {
    id: "wd-stale-readme",
    hit: "write-docs",
    expect: ["write-docs"],
    not: [],
    parts: ["write-docs/scripts/docs-check.mjs"],
    prompt: "The README's export section is out of date now that TSV exists. Update the docs.",
  },
  {
    id: "wd-none",
    hit: "write-docs",
    expect: ["write-docs"],
    not: [],
    parts: ["write-docs/references/documentation-shapes.md"],
    prompt: "This project has no developer documentation at all. Fix that.",
  },

  // Write Plan: an ordered plan for carrying out work.
  {
    id: "wp-import",
    hit: "write-plan",
    expect: ["write-plan"],
    not: ["write-spec"],
    parts: ["write-docs/references/spec-and-plan-shapes.md", "write-docs/scripts/plan-lint.mjs"],
    prompt:
      "Write an implementation plan for the bookmark import feature, step by step, so it's ready before anyone starts coding.",
  },
  {
    id: "wp-revise",
    hit: "write-plan",
    expect: ["write-plan"],
    not: [],
    parts: ["write-docs/scripts/plan-lint.mjs"],
    prompt:
      "Update docs/PLAN-tags.md: step 3 has to come before step 2 now, and there needs to be a step for converting existing tags.",
  },
  {
    id: "wp-remediation",
    hit: "write-plan",
    expect: ["write-plan"],
    not: [],
    parts: ["write-docs/references/spec-and-plan-shapes.md", "write-docs/scripts/plan-lint.mjs"],
    prompt:
      "Search has a pile of known problems: accents, case, and it's slow on big shelves. Write a plan for fixing them in a sensible order.",
  },

  // Write Skill: agent skills and other instruction text.
  {
    id: "wsk-agents",
    hit: "write-skill",
    expect: ["write-skill"],
    not: [],
    prompt: "Improve AGENTS.md so coding agents working here stop forgetting to update the CHANGELOG.",
  },
  {
    id: "wsk-new-skill",
    hit: "write-skill",
    expect: ["write-skill"],
    not: [],
    prompt: "Create a skill that teaches a coding agent how to add a new export format to shelf.",
  },
  {
    id: "wsk-claude-md",
    hit: "write-skill",
    expect: ["write-skill"],
    not: [],
    prompt: "Write a CLAUDE.md for this repository with the instructions an AI coding assistant needs here.",
  },
  {
    id: "nm-wsk-readme",
    hit: null,
    expect: [],
    not: ["write-skill"],
    prompt: "Improve the README's install section so new users understand how to install shelf.",
  },

  // Write Spec: a document that defines what to build or decide.
  {
    id: "ws-sync",
    hit: "write-spec",
    expect: ["write-spec"],
    not: ["write-docs"],
    parts: ["write-docs/references/spec-and-plan-shapes.md", "write-docs/scripts/artifact-check.mjs"],
    prompt: "Write a spec for syncing shelves between devices: what it must do, for whom, and what's out of scope.",
  },
  {
    id: "ws-decision",
    hit: "write-spec",
    expect: ["write-spec"],
    not: [],
    parts: ["write-docs/references/spec-and-plan-shapes.md", "write-docs/scripts/artifact-check.mjs"],
    prompt:
      "We decided to keep the JSON file instead of moving to SQLite. Write that up as a decision record with the reasons.",
  },
  {
    id: "ws-design",
    hit: "write-spec",
    expect: ["write-spec"],
    not: ["write-plan"],
    parts: ["write-docs/references/spec-and-plan-shapes.md", "write-docs/scripts/artifact-check.mjs"],
    prompt: "Write a technical design document for how sync between devices should work.",
  },
];

/** The skill that does a measured skill's job on a build that merged it: its owner, itself when not merged. */
export const ownerOf = (skill) => (Object.hasOwn(MERGED, skill) ? MERGED[skill] : skill);

/** The skills a build with every merge applied ships (v0.9.0): the owners of the measured skills. */
export const OWNERS = [...new Set(SKILLS.map(ownerOf).filter(Boolean))];

/**
 * A case as one build measures it. `present` holds the skills the build ships. On the base every measured skill is
 * present and the case is unchanged. On a build without a measured skill, its owner (MERGED) takes its place:
 *
 * - `expect`: an absent skill's owner counts as the route; `owned` is false when no skill does the request's job any
 *   more (Action Selection), and the request then counts toward no hit rate.
 * - `checks`: one near-miss check per `not` skill, `{ skill, family, target }`: `target` is the skill whose opening is
 *   the false trigger on this build (the skill itself, or its owner), `family` its owner on every build, so before
 *   and after of one owner add up the same checks. A check is dropped, and listed in `dropped` with its reason, when
 *   its target has no owner, is the request's own route (`expect`), is a skill the case's `route` names as also
 *   doing the request's job, or repeats another check's target.
 *
 * @param {object} entry a case from CASES
 * @param {Set<string>} present the skills the build ships
 */
export function routeCase(entry, present) {
  const target = (skill) => (present.has(skill) || !Object.hasOwn(MERGED, skill) ? skill : MERGED[skill]);
  const expect = [...new Set(entry.expect.map(target).filter(Boolean))];
  const checks = [];
  const dropped = [];
  // Skills the build ships come first, so a repeat drops the merged skill's check rather than the owner's own.
  const order = [...entry.not].sort((a, b) => Number(target(a) !== a) - Number(target(b) !== b));
  for (const skill of order) {
    const owner = target(skill);
    const reason =
      owner === null
        ? "no owner"
        : expect.includes(owner)
          ? "own route"
          : owner !== skill && (entry.route ?? []).includes(owner)
            ? "shares the request's route"
            : checks.some((check) => check.target === owner)
              ? "repeats a check"
              : null;
    if (reason === null) checks.push({ skill, family: ownerOf(skill), target: owner });
    else dropped.push({ skill, target: owner, reason });
  }
  return { ...entry, expect, owned: entry.hit === null || expect.length > 0, checks, dropped };
}

/**
 * The skills a group's graded checks name: `read` (the run read its SKILL.md) and `no` (it never did). They are the
 * base's checks plus the merged build's (OWNERS), so either build's route shows in the grade; a skill already checked
 * keeps its base check. A check on a skill a build lacks passes or fails by construction there; the report's rates,
 * which know the build, are the measure.
 */
export function gradedSkills(entry) {
  const base = routeCase(entry, new Set(SKILLS));
  const merged = routeCase(entry, new Set(OWNERS));
  const read = [...base.expect];
  const no = base.checks.map((check) => check.target);
  for (const skill of merged.expect) if (!read.includes(skill) && !no.includes(skill)) read.push(skill);
  for (const { target } of merged.checks) if (!read.includes(target) && !no.includes(target)) no.push(target);
  return { read, no };
}
