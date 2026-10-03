import assert from "node:assert/strict";
import test from "node:test";

import { CURSOR_MARKER, visibleWidth } from "@earendil-works/pi-tui";

import { PiSettingsComponent } from "../../dist/host/settings/settings-view.js";

const theme = {
  fg(_color, text) {
    return text;
  },
  bold(text) {
    return text;
  },
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createComponent(entries, options = {}) {
  const notifications = [];
  let closed = false;
  const component = new PiSettingsComponent({
    title: options.title ?? "Test Settings",
    entries,
    theme: options.theme ?? theme,
    requestRender() {},
    notify(message, level) {
      notifications.push({ message, level });
    },
    done() {
      closed = true;
    },
  });
  return { component, notifications, isClosed: () => closed };
}

test("Pi settings publish values only after persistence and block concurrent edits", async () => {
  let current = "disabled";
  let commits = 0;
  const write = deferred();
  const entry = {
    id: "feature.enabled",
    label: "Feature",
    description: "Enable the feature.",
    currentValue: () => current,
    inactive: () => false,
    currentChoiceKey: () => (current === "enabled" ? "true" : "false"),
    choices: [
      { key: "true", value: true, label: "enabled" },
      { key: "false", value: false, label: "disabled" },
    ],
    async commit() {
      commits += 1;
      await write.promise;
      current = "enabled";
      return { changed: true, reloadRequired: true };
    },
  };
  const { component } = createComponent([entry]);

  component.handleInput("\r");
  component.handleInput("\u001b[A");
  component.handleInput("\r");
  component.handleInput("\r");

  assert.equal(commits, 1);
  assert.equal(current, "disabled");
  write.resolve();
  await component.waitForWrites();
  assert.equal(current, "enabled");
  assert.match(component.render(80).join("\n"), /Feature\s+enabled/);
  assert.deepEqual(component.sessionResult(), { changed: true, configChanged: true, failed: false });
});

test("Pi settings retain the persisted value when a write fails", async () => {
  const current = "disabled";
  const entry = {
    id: "feature.enabled",
    label: "Feature",
    description: "Enable the feature.",
    currentValue: () => current,
    inactive: () => false,
    currentChoiceKey: () => "false",
    choices: [
      { key: "true", value: true, label: "enabled" },
      { key: "false", value: false, label: "disabled" },
    ],
    async commit() {
      throw new Error("disk unavailable");
    },
  };
  const { component, notifications } = createComponent([entry]);

  component.handleInput("\r");
  component.handleInput("\u001b[A");
  component.handleInput("\r");
  await component.waitForWrites();
  component.handleInput("\u001b");

  assert.equal(current, "disabled");
  assert.match(component.render(80).join("\n"), /Feature\s+disabled/);
  assert.deepEqual(component.sessionResult(), { changed: false, configChanged: false, failed: true });
  assert.deepEqual(notifications, [{ message: "Write failed: disk unavailable", level: "error" }]);
});

test("Pi settings delegate paste, cursor, grapheme, and IME behavior to Input", async () => {
  let current = "";
  const entry = {
    id: "feature.label",
    label: "Label",
    description: "Unicode label.",
    currentValue: () => current,
    inactive: () => false,
    edit: {
      initialValue: () => current,
      parse: (text) => text,
    },
    async commit(value) {
      current = value;
      return { changed: true, reloadRequired: true };
    },
  };
  const { component } = createComponent([entry]);
  component.focused = true;

  component.handleInput("\r");
  assert.ok(component.render(40).join("\n").includes(CURSOR_MARKER));
  component.handleInput("\u001b[200~ab🙂\u001b[201~");
  component.handleInput("\u001b[D");
  component.handleInput("\u007f");
  component.handleInput("界");
  component.handleInput("\r");
  await component.waitForWrites();

  assert.equal(current, "a界🙂");
});

test("Pi settings start value editing at the end of the existing value", async () => {
  let current = "abc";
  const entry = {
    id: "feature.label",
    label: "Label",
    description: "Editable label.",
    currentValue: () => current,
    inactive: () => false,
    edit: {
      initialValue: () => current,
      parse: (text) => text,
    },
    async commit(value) {
      current = value;
      return { changed: true, reloadRequired: true };
    },
  };
  const { component } = createComponent([entry]);

  component.handleInput("\r");
  component.handleInput("X");
  component.handleInput("\r");
  await component.waitForWrites();

  assert.equal(current, "abcX");
});

test("Pi settings keep typed input open when parsing fails", () => {
  let commits = 0;
  const entry = {
    id: "feature.limit",
    label: "Limit",
    description: "Positive integer.",
    currentValue: () => "1",
    inactive: () => false,
    edit: {
      initialValue: () => "",
      parse(text) {
        const value = Number(text);
        if (!Number.isInteger(value) || value <= 0) throw new Error("expected a positive integer");
        return value;
      },
    },
    async commit() {
      commits += 1;
      return { changed: true, reloadRequired: true };
    },
  };
  const { component } = createComponent([entry]);

  component.handleInput("\r");
  component.handleInput("invalid");
  component.handleInput("\r");

  assert.equal(commits, 0);
  assert.match(component.render(60).join("\n"), /Invalid value: expected a positive integer/);
});

function cycling(label, keys, initial = keys[0]) {
  let current = initial;
  const commits = [];
  return {
    entry: {
      id: label.toLowerCase(),
      label,
      description: `${label} setting.`,
      currentValue: () => current,
      inactive: () => false,
      cycle: true,
      currentChoiceKey: () => current,
      choices: keys.map((key) => ({ key, value: key, label: key, description: `${key} meaning` })),
      async commit(value) {
        commits.push(value);
        current = value;
        return { changed: true, reloadRequired: false };
      },
    },
    commits,
    current: () => current,
  };
}

test("a small choice changes in place on Enter or Space, cycling back to the start", async () => {
  const setting = cycling("Compaction", ["inherit", "true", "false"]);
  const { component } = createComponent([setting.entry]);

  component.handleInput("\r");
  await component.waitForWrites();
  component.handleInput(" ");
  await component.waitForWrites();
  assert.deepEqual(setting.commits, ["true", "false"]);
  // No picker page opened: the list and the chosen value's meaning are on screen.
  const rendered = component.render(80).join("\n");
  assert.match(rendered, /› Compaction\s+false/);
  assert.match(rendered, /false: false meaning/);
  component.handleInput("\r");
  await component.waitForWrites();
  assert.equal(setting.current(), "inherit");
});

test("the cursor skips section headers and inactive settings do not change", async () => {
  const first = cycling("First", ["on", "off"]);
  const second = cycling("Second", ["on", "off"]);
  second.entry.inactive = () => true;
  const section = {
    id: "s",
    label: "Section",
    description: "",
    section: true,
    currentValue: () => "active",
    inactive: () => false,
  };
  const { component } = createComponent([first.entry, section, second.entry]);

  component.handleInput("\u001b[B");
  assert.match(component.render(80).join("\n"), /› Second/, "down moves past the header");
  component.handleInput("\r");
  await component.waitForWrites();
  assert.deepEqual(second.commits, []);
  assert.match(component.render(80).join("\n"), /Second\s+on · inactive/);
});

test("Tab and Shift+Tab switch scopes, each with its own settings", async () => {
  const scopes = ["Session", "Personal", "Repository"].map((label) => ({
    id: label.toLowerCase(),
    label,
    summary: `${label} values.`,
    load: () => [cycling(`${label} switch`, ["on", "off"]).entry],
  }));
  const component = new PiSettingsComponent({
    title: "Freeflow settings",
    scopes,
    initialScope: "personal",
    theme,
    requestRender() {},
    done() {},
  });
  await component.ready();
  assert.match(component.render(90).join("\n"), /\[Personal\][\s\S]*Personal values\.[\s\S]*Personal switch/);
  component.handleInput("\t");
  await component.ready();
  assert.match(component.render(90).join("\n"), /\[Repository\][\s\S]*Repository switch/);
  component.handleInput("\u001b[Z");
  component.handleInput("\u001b[Z");
  await component.ready();
  assert.match(component.render(90).join("\n"), /\[Session\][\s\S]*Session switch/);
  assert.match(component.render(90).join("\n"), /Tab scope/);
});

test("Pi settings keep ANSI and Unicode rendering within terminal width", () => {
  const ansiTheme = {
    fg(_color, text) {
      return `\u001b[36m${text}\u001b[0m`;
    },
    bold(text) {
      return `\u001b[1m${text}\u001b[22m`;
    },
  };
  const entry = {
    id: "unicode",
    label: "設定🙂",
    description: "幅の広い Unicode description with several words.",
    currentValue: () => "有効界",
    inactive: () => true,
  };
  const { component } = createComponent([entry], { title: "設定パネル", theme: ansiTheme });

  for (const width of [12, 20, 40]) {
    for (const line of component.render(width)) {
      assert.ok(visibleWidth(line) <= width, `line width ${visibleWidth(line)} exceeds ${width}: ${line}`);
    }
  }
});
