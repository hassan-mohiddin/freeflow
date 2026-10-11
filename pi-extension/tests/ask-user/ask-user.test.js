import assert from "node:assert/strict";
import test from "node:test";
import { outcomeText, validateQuestions } from "../../dist/ask-user/questions.js";
import { QuestionForm } from "../../dist/ask-user/form.js";
import { askUser, confirmWithUser } from "../../dist/ask-user/ask.js";
import { registerAskUserTool } from "../../dist/ask-user/tool.js";

// ask_user: what it accepts, the dialog in the terminal and over RPC, and what the model reads afterwards.
const theme = { fg: (_c, t) => t, bold: (t) => t };
const KEY = { up: "\u001b[A", down: "\u001b[B", enter: "\r", escape: "\u001b", tab: "\t" };
const q = (header, options, extra = {}) => ({
  question: `Pick ${header}?`,
  header,
  options: options.map((label) => ({ label, description: `about ${label}` })),
  ...extra,
});
const screen = (form) =>
  form
    .render(100)
    .map((line) => line.trimEnd())
    .join("\n");
const type = (form, text) => {
  for (const ch of text) form.handleInput(ch);
};

test("questions are checked against Claude Code's shape", () => {
  assert.match(validateQuestions([]).error, /1 to 4 questions/);
  assert.match(validateQuestions([q("A", ["x"])]).error, /2 to 4 options/);
  assert.match(validateQuestions([q("This header is long", ["x", "y"])]).error, /header of 1 to 12/);
  assert.match(validateQuestions([q("A", ["x", "Other"])]).error, /adds the user's own answer itself/);
  assert.match(validateQuestions([q("A", ["x", "y"]), q("A", ["x", "y"])]).error, /repeats the header/);
  const ok = validateQuestions([q("Default", ["Off (Recommended)", "On"], { multiSelect: true })]);
  assert.equal(ok.questions[0].multiSelect, true);
  assert.equal(ok.questions[0].options[0].label, "Off (Recommended)");
});

test("the model reads the answers, each deciding only its question", () => {
  const text = outcomeText({
    status: "answered",
    answers: [
      { header: "Default", question: "On or off?", selected: ["Off"], note: "for now" },
      { header: "Name", question: "Which name?", selected: [], text: "task_memory" },
    ],
  });
  assert.match(text, /^The user answered in a dialog:/);
  assert.match(text, /- Default: On or off\?\n  Answer: Off\n  Note: for now/);
  assert.match(text, /- Name: Which name\?\n  Answer, in their words: task_memory/);
  assert.match(text, /Each answer decides only its question/);
  assert.match(outcomeText({ status: "dismissed" }), /closed the dialog without answering\. Do not act on the choice/);
  assert.match(
    outcomeText({ status: "unavailable", reason: "No UI." }),
    /^No UI\. Ask in your reply and end your turn\./,
  );
});

test("the terminal dialog: one question answers on Enter, with its description shown", () => {
  let outcome;
  const form = new QuestionForm([q("Default", ["Off", "On"])], theme, (o) => (outcome = o));
  const shown = screen(form);
  assert.match(shown, /Default · Pick Default\?/);
  assert.match(shown, /› 1\. Off\n\s+about Off\n\s+2\. On\n\s+about On\n\s+3\. Type my own answer/);
  assert.match(shown, /Esc close without answering/);
  form.handleInput(KEY.down);
  form.handleInput(KEY.enter);
  assert.deepEqual(outcome, {
    status: "answered",
    answers: [{ header: "Default", question: "Pick Default?", selected: ["On"] }],
  });
});

test("the terminal dialog: several questions as tabs, multi-select, own words and a note, then Submit", () => {
  let outcome;
  const form = new QuestionForm(
    [q("Parts", ["A", "B", "C"], { multiSelect: true }), q("Name", ["x", "y"])],
    theme,
    (o) => (outcome = o),
  );
  assert.match(screen(form), /□ Parts\s+□ Name\s+✓ Submit/);
  // Multi-select: Space toggles A and C, then a note, then Enter confirms.
  form.handleInput(" ");
  form.handleInput(KEY.down);
  form.handleInput(KEY.down);
  form.handleInput(" ");
  form.handleInput("n");
  type(form, "C only if cheap");
  form.handleInput(KEY.enter);
  assert.match(screen(form), /\[x\] A[\s\S]*\[ \] B[\s\S]*\[x\] C[\s\S]*Note: C only if cheap/);
  form.handleInput(KEY.enter);
  // The second question: the user's own words.
  assert.match(screen(form), /Name · Pick Name\?/);
  form.handleInput(KEY.down);
  form.handleInput(KEY.down);
  form.handleInput(KEY.enter);
  type(form, "task_memory");
  form.handleInput(KEY.enter);
  assert.match(screen(form), /Your answers[\s\S]*Parts: A, C[\s\S]*note: C only if cheap[\s\S]*Name: "task_memory"/);
  assert.equal(outcome, undefined, "nothing is sent before Submit");
  form.handleInput(KEY.enter);
  assert.deepEqual(outcome.answers, [
    { header: "Parts", question: "Pick Parts?", selected: ["A", "C"], note: "C only if cheap" },
    { header: "Name", question: "Pick Name?", selected: [], text: "task_memory" },
  ]);
});

test("Esc closes the dialog unanswered; a confirmation offers no own answer", () => {
  let outcome;
  const form = new QuestionForm([q("Default", ["Off", "On"])], theme, (o) => (outcome = o));
  form.handleInput(KEY.escape);
  assert.deepEqual(outcome, { status: "dismissed" });
  const confirm = new QuestionForm(
    [{ question: "Attach it?", header: "Attach", options: [{ label: "Yes" }, { label: "No" }] }],
    theme,
    () => {},
    () => {},
    { ownAnswer: false, notes: false },
  );
  assert.doesNotMatch(screen(confirm), /Type my own answer|n note/);
});

test("over RPC: one select per question, own words through input, multi-select until Done", async () => {
  const asked = [];
  const replies = ["B — about B", "Type my own answer", "[ ] A — about A", "[ ] C — about C", "Done"];
  const ctx = {
    hasUI: true,
    mode: "rpc",
    ui: {
      select: async (title, options) => (asked.push([title, options]), replies.shift()),
      input: async () => "my words",
    },
  };
  const outcome = await askUser(ctx, [
    q("One", ["A", "B"]),
    q("Two", ["x", "y"]),
    q("Many", ["A", "B", "C"], { multiSelect: true }),
  ]);
  assert.equal(outcome.status, "answered");
  assert.deepEqual(
    outcome.answers.map((a) => [a.header, a.selected, a.text]),
    [
      ["One", ["B"], undefined],
      ["Two", [], "my words"],
      ["Many", ["A", "C"], undefined],
    ],
  );
  assert.equal(asked[0][0], "One · Pick One?");
  assert.deepEqual(asked[0][1], ["A — about A", "B — about B", "Type my own answer"]);
  assert.ok(asked.at(-1)[1].includes("Done"));
  // A cancelled select dismisses the whole question; no UI means no dialog.
  const cancelled = await askUser({ hasUI: true, mode: "rpc", ui: { select: async () => undefined } }, [
    q("One", ["A", "B"]),
  ]);
  assert.deepEqual(cancelled, { status: "dismissed" });
  assert.equal((await askUser({ hasUI: false }, [q("One", ["A", "B"])])).status, "unavailable");
});

test("Freeflow's confirmations keep Pi's confirm outside the terminal", async () => {
  const calls = [];
  const ctx = { hasUI: true, mode: "rpc", ui: { confirm: async (...args) => (calls.push(args), true) } };
  assert.equal(await confirmWithUser(ctx, "Attach?", "Attach it?"), true);
  assert.deepEqual(calls, [["Attach?", "Attach it?"]]);
  assert.equal(await confirmWithUser({ hasUI: false }, "Attach?", "Attach it?"), false);
});

test("the tool refuses a Cognitive Routing worker, rejects bad questions, and carries a prompt guideline", async () => {
  let tool;
  let refusal;
  registerAskUserTool({ registerTool: (definition) => (tool = definition) }, { refusal: () => refusal });
  assert.equal(tool.exposure, "model-only");
  assert.match(tool.promptGuidelines[0], /^Use ask_user for a choice that is the user's to make/);
  const ctx = { hasUI: true, mode: "rpc", ui: { select: async () => "A — about A" } };
  const answered = await tool.execute("id", { questions: [q("One", ["A", "B"])] }, undefined, undefined, ctx);
  assert.notEqual(answered.isError, true);
  assert.match(answered.content[0].text, /Answer: A/);
  const bad = await tool.execute("id", { questions: [q("One", ["A"])] }, undefined, undefined, ctx);
  assert.equal(bad.isError, true);
  refusal = "A Cognitive Routing worker does not ask the user.";
  const refused = await tool.execute("id", { questions: [q("One", ["A", "B"])] }, undefined, undefined, ctx);
  assert.equal(refused.isError, true);
  assert.equal(refused.content[0].text, refusal);
});
