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

test("completes only the three deterministic profile controls", () => {
  assert.deepEqual(
    cognitiveRoutingProfileCompletions("").map(({ value }) => value),
    ["standard", "reasoning", "auto"],
  );
  assert.deepEqual(
    cognitiveRoutingProfileCompletions("rea").map(({ value }) => value),
    ["reasoning"],
  );
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
