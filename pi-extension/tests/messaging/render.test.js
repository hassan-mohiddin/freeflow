import assert from "node:assert/strict";
import test from "node:test";
import { renderMessage, renderSendCall, renderSendResult } from "../../dist/messaging/render.js";
import { registerAskUserTool } from "../../dist/ask-user/tool.js";

// Task 002 D-008: each row is one line naming what happened; a long body shows only when expanded.
const lines = (component) =>
  component
    .render(200)
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

test("a sent message names its recipient and first line; a long message folds", () => {
  assert.equal(
    lines(renderSendCall({ to: "api", message: "hi" }, undefined, { expanded: false })),
    "Message → api: hi",
  );
  const long = `Line one\n${"more ".repeat(40)}\nLine three\nfour\nfive\nsix`;
  assert.match(
    lines(renderSendCall({ to: "api", message: long }, undefined, { expanded: false })),
    /^Message → api: Line one \(\d+ lines, ctrl\+o to expand\)$/,
  );
  assert.match(
    lines(renderSendCall({ to: "api", message: long }, undefined, { expanded: true })),
    /\n {2}Line three\n/,
  );
  const delivered = {
    details: { status: "delivered", name: "api" },
    content: [{ type: "text", text: "Delivered to api (x)." }],
  };
  assert.equal(lines(renderSendResult(delivered, { expanded: false })), "Delivered to api");
  const held = {
    details: { status: "held", name: "api" },
    content: [{ type: "text", text: "Held for api's user..." }],
  };
  assert.equal(lines(renderSendResult(held, { expanded: false })), "Held for api's user to accept");
});

test("a received message shows its sender and text, not the tag; outcomes and status are one line", () => {
  const message = {
    content: '<message from="api" session="s1" folder="/repo">\nNot done yet.\n</message>',
    details: { kind: "message", name: "api", from: "s1" },
  };
  assert.equal(lines(renderMessage(message, { expanded: false })), "Message ← api: Not done yet.");
  const outcome = {
    content: "<message-status>…</message-status>",
    details: { kind: "outcome", name: "api", status: "refused" },
  };
  assert.equal(lines(renderMessage(outcome, { expanded: false })), "Message to api: refused");
  const idle = { content: "<session-status>…</session-status>", details: { kind: "idle", name: "api" } };
  assert.equal(lines(renderMessage(idle, { expanded: false })), "Session api is now idle");
});

test("ask_user rows show the question and the answer, or that the dialog was closed", () => {
  let tool;
  registerAskUserTool({ registerTool: (definition) => (tool = definition) }, { refusal: () => undefined });
  const args = {
    questions: [
      {
        header: "Default",
        question: "Ship it on or off?",
        options: [{ label: "On" }, { label: "Off", description: "safer" }],
      },
    ],
  };
  assert.equal(lines(tool.renderCall(args, undefined, { expanded: false })), "Question · Default: Ship it on or off?");
  assert.match(lines(tool.renderCall(args, undefined, { expanded: true })), /\n {2}- Off — safer$/);
  const answered = {
    details: {
      outcome: {
        status: "answered",
        answers: [{ header: "Default", question: "q", selected: ["Off"], note: "for now" }],
      },
    },
  };
  assert.equal(lines(tool.renderResult(answered, { expanded: false })), "Answered · Default: Off (note: for now)");
  const own = {
    details: {
      outcome: { status: "answered", answers: [{ header: "Default", question: "q", selected: [], text: "later" }] },
    },
  };
  assert.equal(lines(tool.renderResult(own, { expanded: false })), 'Answered · Default: "later"');
  const closed = { details: { outcome: { status: "dismissed" } } };
  assert.equal(lines(tool.renderResult(closed, { expanded: false })), "Closed without answering (Esc)");
});
