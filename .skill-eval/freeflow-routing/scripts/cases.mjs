// The routing cases: natural requests a user might make in the shelf project (fixtures/shelf), each with the skill
// whose hit rate it counts toward (`hit`), the skills whose opening counts as the right route (`expect`, any of them;
// empty when no skill is needed), and the skills that must not open (`not`: a near miss for each). A hit case for one
// skill is often the near miss of its neighbour (a commit request must not open Finish Branch), so the same case can
// serve both. Workflow's cases accept Agree Work and Execute Work too: they are the skills a change to code reaches,
// with or without Workflow, so before and after the Workflow removal measure the same route.

/** Every skill Freeflow ships to the model on main (FREEFLOW_MODEL_SKILL_NAMES); Workflow is the one the plan removes. */
// Skills the suite still measures although Freeflow has removed them, each with the skill that took over its job:
// the suite runs on the pinned base, where they exist, and again on later builds, so before and after compare the
// same requests. A request whose skill was merged counts as routed when it opens the skill that took over.
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
    prompt: "This is urgent: the CSV export breaks when a title has a comma in it. Please fix it.",
  },

  // Commit Work: an explicitly requested local commit.
  {
    id: "cw-commit-tsv",
    hit: "commit-work",
    expect: ["commit-work"],
    not: ["finish-branch"],
    prompt: "Commit the TSV export work I did (src/export.js and its test) with a good message.",
  },
  {
    id: "cw-commit-all",
    hit: "commit-work",
    expect: ["commit-work"],
    not: [],
    prompt: "Please commit what's currently changed in the working tree.",
  },
  {
    id: "cw-commit-push",
    hit: "commit-work",
    expect: ["commit-work"],
    not: ["release-work"],
    prompt: "Commit the export changes and push them.",
  },

  // Design For Depth: structure choices that could make the code harder to change later.
  {
    id: "dd-backends",
    hit: "design-for-depth",
    expect: ["design-for-depth"],
    not: ["migration-work"],
    prompt:
      "Later I want shelf to be able to keep bookmarks in SQLite as well as the JSON file. How should the storage code be structured so a second backend is easy to add? Work out the design before changing anything.",
  },
  {
    id: "dd-exporters",
    hit: "design-for-depth",
    expect: ["design-for-depth"],
    not: [],
    prompt:
      "Export formats are one big switch in src/export.js. Restructure it so a new format can be added without touching the core, and design the interface first.",
  },
  {
    id: "dd-errors",
    hit: "design-for-depth",
    expect: ["design-for-depth"],
    not: [],
    prompt:
      "Errors are handled differently all over this codebase: some functions throw, some print and exit, some return nothing. Design one consistent way to handle errors.",
  },
  {
    id: "nm-dd-local",
    hit: null,
    expect: [],
    not: ["design-for-depth"],
    prompt: "In src/format.js, the variable x in padTitle needs a clearer name. Rename it.",
  },

  // Diagnose Failure: a failure whose cause is not known.
  {
    id: "df-cafe",
    hit: "diagnose-failure",
    expect: ["diagnose-failure"],
    not: [],
    prompt: "Searching for 'cafe' no longer finds my bookmark 'Café Culture in Vienna', but it used to. Why?",
  },
  {
    id: "df-test-fails",
    hit: "diagnose-failure",
    expect: ["diagnose-failure"],
    not: [],
    prompt:
      "npm test fails in test/store.test.js and I have no idea why. Can you find out what's going on before anyone changes the test?",
  },
  {
    id: "df-slow-list",
    hit: "diagnose-failure",
    expect: ["diagnose-failure"],
    not: [],
    prompt:
      "For people with big shelves, the list page of `shelf serve` takes seconds to load. Something is slow and I don't know what.",
  },
  {
    id: "nm-df-known-cause",
    hit: null,
    expect: [],
    not: ["diagnose-failure"],
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
    prompt:
      "We've decided on folders. Add a `folder` field to bookmarks and a --folder option to `shelf add` and `shelf list`.",
  },

  // Evaluate Behavior: testing or comparing how an agent behaves.
  {
    id: "eb-agents-rule",
    hit: "evaluate-behavior",
    expect: ["evaluate-behavior"],
    not: [],
    prompt:
      "AGENTS.md tells agents to run npm test before saying a change works. How can I test whether coding agents actually follow that? Set up an evaluation.",
  },
  {
    id: "eb-compare-models",
    hit: "evaluate-behavior",
    expect: ["evaluate-behavior"],
    not: [],
    prompt:
      "I want to compare how a small model and a large model handle fixing the CSV quoting bug in this repo, with numbers rather than anecdotes. How do we do that?",
  },
  {
    id: "eb-wording",
    hit: "evaluate-behavior",
    expect: ["evaluate-behavior"],
    not: [],
    prompt:
      "If I reword the changelog rule in AGENTS.md, will agents follow it more often? I want to measure the old wording against a new one.",
  },

  // Execute Work: carrying out approved work that changes files.
  {
    id: "ew-plan-step-2",
    hit: "execute-work",
    expect: ["execute-work"],
    not: ["write-plan"],
    prompt: "The tags plan in docs/PLAN-tags.md is agreed. Go ahead and implement step 2.",
  },
  {
    id: "ew-agreed-json",
    hit: "execute-work",
    expect: ["execute-work"],
    not: [],
    prompt:
      "As we agreed yesterday: make `shelf list --json` print one JSON array instead of one object per line, and update the test. Go ahead.",
  },
  {
    id: "ew-lint-script",
    hit: "execute-work",
    expect: ["execute-work"],
    not: [],
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
    prompt: "I'm done with the feature/tag-rename branch. What should we do with it now? Merge it?",
  },
  {
    id: "fb-pull-request",
    hit: "finish-branch",
    expect: ["finish-branch"],
    not: ["commit-work"],
    prompt: "Open a pull request for the tag-rename branch.",
  },
  {
    id: "fb-abandon",
    hit: "finish-branch",
    expect: ["finish-branch"],
    not: [],
    prompt: "I don't think the tag-rename branch is worth finishing. Should we throw it away or park it somewhere?",
  },

  // Handoff: work continued later or by someone else.
  {
    id: "ho-stop-today",
    hit: "handoff",
    expect: ["handoff"],
    not: [],
    prompt:
      "I have to stop for today. Write things up so I, or someone else, can pick up the tag-rename work tomorrow.",
  },
  {
    id: "ho-colleague",
    hit: "handoff",
    expect: ["handoff"],
    not: [],
    prompt: "My colleague Priya is taking over the tag-rename work from here. Prepare what she needs to continue.",
  },
  {
    id: "ho-new-session",
    hit: "handoff",
    expect: ["handoff"],
    not: [],
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
    prompt: "Deploy the current version of shelf to production.",
  },
  {
    id: "lw-rollback",
    hit: "launch-work",
    expect: ["launch-work"],
    not: [],
    prompt: "Production has been broken since this morning's deploy: users get 500s on the list page. Roll it back.",
  },
  {
    id: "lw-restore",
    hit: "launch-work",
    expect: ["launch-work"],
    not: [],
    prompt:
      "Yesterday's failed release wiped the production data volume. We need to get the service back from last night's snapshot; docs/deploy.md says how it's set up.",
  },

  // Map Features: a saved, tested way to check the software live.
  {
    id: "mf-setup",
    hit: "map-features",
    expect: ["map-features"],
    not: [],
    prompt:
      "I want a repeatable way to check that shelf really works end to end: start it and try each feature the way a user would. Set that up so we can rerun it.",
  },
  {
    id: "mf-before-releases",
    hit: "map-features",
    expect: ["map-features"],
    not: [],
    prompt:
      "Before each release I click through the web view and try the CLI commands by hand. Turn that into saved steps we can run every time.",
  },
  {
    id: "mf-live-checks",
    hit: "map-features",
    expect: ["map-features"],
    not: [],
    prompt:
      "We have unit tests but nothing that checks the running app. Create live checks for the CLI and the web view, written down so future changes can be checked the same way.",
  },

  // Migration Work: moving something in use, with users' data, to a new implementation.
  {
    id: "mg-sqlite",
    hit: "migration-work",
    expect: ["migration-work"],
    not: [],
    prompt:
      "Move bookmark storage from the JSON file to SQLite. People already have years of bookmarks in their JSON files, and nobody can lose any.",
  },
  {
    id: "mg-tags-array",
    hit: "migration-work",
    expect: ["migration-work"],
    not: [],
    prompt:
      "Tags are stored as a comma-separated string. Change them to a real array, and make sure every existing user's bookmarks.json still loads afterwards.",
  },
  {
    id: "mg-hosting",
    hit: "migration-work",
    expect: ["migration-work"],
    not: [],
    prompt:
      "We're moving the hosted web view off fly.io onto our own server next week, without losing anyone's data or taking it down. Prepare the move.",
  },
  {
    id: "nm-mg-notes",
    hit: null,
    expect: [],
    not: ["migration-work"],
    prompt: "Add an optional notes field that people can set on new bookmarks with --notes.",
  },

  // Release Work: preparing, publishing or verifying a versioned release.
  {
    id: "rw-cut",
    hit: "release-work",
    expect: ["release-work"],
    not: ["launch-work"],
    prompt: "Cut the 1.5.0 release: update the version and the changelog, and tag it.",
  },
  {
    id: "rw-prepare",
    hit: "release-work",
    expect: ["release-work"],
    not: [],
    prompt: "Get things ready for the next release. What should the version number be, and what goes in the changelog?",
  },
  {
    id: "rw-verify-published",
    hit: "release-work",
    expect: ["release-work"],
    not: [],
    prompt: "We published shelf 1.4.0 to npm yesterday. Check that the published package is actually right.",
  },

  // Review Work: judging whether finished work or a guiding document is right and complete enough.
  {
    id: "rv-branch",
    hit: "review-work",
    expect: ["review-work"],
    not: ["verify-work"],
    prompt: "Review the changes on the tag-rename branch before I merge them.",
  },
  {
    id: "rv-plan",
    hit: "review-work",
    expect: ["review-work"],
    not: ["verify-work", "write-plan"],
    prompt: "Take a critical look at docs/PLAN-tags.md. Is it complete enough to build from?",
  },
  {
    id: "rv-tsv-change",
    hit: "review-work",
    expect: ["review-work"],
    not: [],
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
    prompt: "src/format.js works, but it's a mess. Clean it up without changing what it prints.",
  },
  {
    id: "sc-duplicate",
    hit: "simplify-code",
    expect: ["simplify-code"],
    not: [],
    prompt:
      "URL normalizing is duplicated in src/store.js and src/search.js. Refactor it into one place; behavior stays the same.",
  },
  {
    id: "sc-cli-args",
    hit: "simplify-code",
    expect: ["simplify-code"],
    not: [],
    prompt:
      "The argument parsing in bin/shelf.js is far more complicated than it needs to be. Simplify it, keeping the behavior identical.",
  },
  {
    id: "nm-sc-feature",
    hit: null,
    expect: [],
    not: ["simplify-code"],
    prompt: "Make `shelf list` show each bookmark's tags as a column, in src/format.js.",
  },

  // Track Work: task memory that outlasts the conversation.
  {
    id: "tw-start",
    hit: "track-work",
    expect: ["track-work"],
    not: [],
    prompt:
      "The tag-rename work will take a few days across several sessions. Start a working record for it so nothing gets lost.",
  },
  {
    id: "tw-recover",
    hit: "track-work",
    expect: ["track-work"],
    not: [],
    prompt: "I'm back after a week away. Where did we leave the tag-rename work? Pick it up from the task record.",
  },
  {
    id: "tw-update",
    hit: "track-work",
    expect: ["track-work"],
    not: [],
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
    prompt:
      "Start `shelf serve` with SHELF_HOME pointing at a copy of data/sample.json and check that the list page shows all the sample bookmarks.",
  },

  // Workflow: work that changes code or takes more than one step. Agree Work and Execute Work count too (see top).
  {
    id: "wf-fix-and-test",
    hit: "workflow",
    expect: BUILD,
    not: [],
    prompt: "Make the CSV export quote titles that contain commas, and add a test for it.",
  },
  {
    id: "wf-import",
    hit: "workflow",
    expect: BUILD,
    not: [],
    prompt:
      "Add an import command that reads a browser's exported bookmarks HTML file into the shelf, then document it in the README.",
  },
  {
    id: "wf-rename-data",
    hit: "workflow",
    expect: BUILD,
    not: [],
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
    prompt:
      "New contributors keep asking how shelf is put together. Write developer docs explaining how storage, search, export and the web view fit together.",
  },
  {
    id: "wd-stale-readme",
    hit: "write-docs",
    expect: ["write-docs"],
    not: [],
    prompt: "The README's export section is out of date now that TSV exists. Update the docs.",
  },
  {
    id: "wd-none",
    hit: "write-docs",
    expect: ["write-docs"],
    not: [],
    prompt: "This project has no developer documentation at all. Fix that.",
  },

  // Write Plan: an ordered plan for carrying out work.
  {
    id: "wp-import",
    hit: "write-plan",
    expect: ["write-plan"],
    not: ["write-spec"],
    prompt:
      "Write an implementation plan for the bookmark import feature, step by step, so it's ready before anyone starts coding.",
  },
  {
    id: "wp-revise",
    hit: "write-plan",
    expect: ["write-plan"],
    not: [],
    prompt:
      "Update docs/PLAN-tags.md: step 3 has to come before step 2 now, and there needs to be a step for converting existing tags.",
  },
  {
    id: "wp-remediation",
    hit: "write-plan",
    expect: ["write-plan"],
    not: [],
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
    prompt: "Write a spec for syncing shelves between devices: what it must do, for whom, and what's out of scope.",
  },
  {
    id: "ws-decision",
    hit: "write-spec",
    expect: ["write-spec"],
    not: [],
    prompt:
      "We decided to keep the JSON file instead of moving to SQLite. Write that up as a decision record with the reasons.",
  },
  {
    id: "ws-design",
    hit: "write-spec",
    expect: ["write-spec"],
    not: ["write-plan"],
    prompt: "Write a technical design document for how sync between devices should work.",
  },
];
