import assert from "node:assert/strict";
import test from "node:test";
import {
  cognitiveRoutingProfileCompletions,
  handleCognitiveRoutingProfileCommand,
} from "../../dist/cognitive-routing/commands.js";

function createContext() {
  const notifications = [];
  return {
    notifications,
    ui: {
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
  };
}

test("completes profile controls and read-only history views", () => {
  assert.deepEqual(
    cognitiveRoutingProfileCompletions("").map(({ value }) => value),
    ["standard", "reasoning", "auto", "history", "history active", "history anomalies"],
  );
  assert.deepEqual(
    cognitiveRoutingProfileCompletions("rea").map(({ value }) => value),
    ["reasoning"],
  );
  assert.deepEqual(
    cognitiveRoutingProfileCompletions("history ").map(({ value }) => value),
    ["history active", "history anomalies"],
  );
});

test("reads history without requiring an idle Pi or mutating the controller", async () => {
  const context = createContext();
  context.isIdle = () => false;
  const calls = [];
  context.history = async (options) => {
    calls.push(options);
    return {
      current: { control: "automatic", profile: "standard" },
      summary: { unresolvedCount: 0, anomalyCount: 0 },
      events: [],
    };
  };

  assert.equal(await handleCognitiveRoutingProfileCommand("profile history active", context, undefined), true);
  assert.deepEqual(calls, [{ scope: "active-branch" }]);
  assert.match(context.notifications[0].message, /Cognitive Routing history/);
  assert.equal(context.notifications[0].level, "info");
});

test("routes standard and reasoning to manual controller ownership", async () => {
  const calls = [];
  const controller = {
    async setManualProfile(profile) {
      calls.push(["manual", profile]);
      return { status: "active", profile };
    },
    async setAutomaticControl() {
      calls.push(["automatic"]);
      return { status: "automatic" };
    },
  };
  const context = createContext();

  assert.equal(await handleCognitiveRoutingProfileCommand("profile standard", context, controller), true);
  assert.equal(await handleCognitiveRoutingProfileCommand("profile reasoning", context, controller), true);
  assert.deepEqual(calls, [
    ["manual", "standard"],
    ["manual", "reasoning"],
  ]);
  assert.equal(context.notifications.length, 2);
});

test("releases manual ownership through auto without a model transition", async () => {
  let calls = 0;
  const controller = {
    async setManualProfile() {
      throw new Error("must not set a profile");
    },
    async setAutomaticControl() {
      calls += 1;
      return { status: "automatic" };
    },
  };
  const context = createContext();

  assert.equal(await handleCognitiveRoutingProfileCommand("profile auto", context, controller), true);
  assert.equal(calls, 1);
  assert.match(context.notifications[0].message, /automatic control is active/);
});

test("rejects manual profile changes while Pi is running", async () => {
  const context = createContext();
  context.isIdle = () => false;
  let calls = 0;
  const controller = {
    async setManualProfile() {
      calls += 1;
      return { status: "active", profile: "standard" };
    },
    async setAutomaticControl() {
      calls += 1;
      return { status: "automatic" };
    },
  };

  assert.equal(await handleCognitiveRoutingProfileCommand("profile reasoning", context, controller), true);
  assert.equal(calls, 0);
  assert.match(context.notifications[0].message, /only while Pi is idle/);
});

test("does not turn conversational or malformed input into a control", async () => {
  const context = createContext();
  let calls = 0;
  const controller = {
    async setManualProfile() {
      calls += 1;
      return { status: "active", profile: "standard" };
    },
    async setAutomaticControl() {
      calls += 1;
      return { status: "automatic" };
    },
  };

  assert.equal(await handleCognitiveRoutingProfileCommand("hello", context, controller), false);
  assert.equal(await handleCognitiveRoutingProfileCommand("profile maybe", context, controller), true);
  assert.equal(await handleCognitiveRoutingProfileCommand("profile", context, controller), true);
  assert.equal(calls, 0);
  assert.equal(context.notifications.length, 2);
});
