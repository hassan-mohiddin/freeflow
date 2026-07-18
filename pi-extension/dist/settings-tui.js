import { Input, matchesKey, SelectList, SettingsList, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
class SettingsCoordinator {
  requestRender;
  notify;
  done;
  activeInput = null;
  closeAfterWrite = false;
  focusedValue = false;
  pendingWrite = Promise.resolve();
  result = {
    changed: false,
    configChanged: false,
    failed: false,
  };
  pending = false;
  constructor(requestRender, notify, done) {
    this.requestRender = requestRender;
    this.notify = notify;
    this.done = done;
  }
  get focused() {
    return this.focusedValue;
  }
  set focused(value) {
    this.focusedValue = value;
    if (this.activeInput) this.activeInput.focused = value;
  }
  setActiveInput(input) {
    if (this.activeInput) this.activeInput.focused = false;
    this.activeInput = input;
    if (input) input.focused = this.focusedValue;
  }
  requestClose() {
    if (this.pending) {
      this.closeAfterWrite = true;
      return;
    }
    this.done();
  }
  requestRenderNow() {
    this.requestRender();
  }
  commit(entry, value) {
    if (this.pending || !entry.commit) return Promise.resolve(false);
    this.pending = true;
    this.requestRender();
    let committed = false;
    this.pendingWrite = (async () => {
      try {
        const outcome = await entry.commit(value);
        if (outcome.changed) {
          this.result.changed = true;
          this.result.configChanged ||= outcome.reloadRequired;
        }
        committed = true;
      } catch (error) {
        this.result.failed = true;
        const message = error instanceof Error ? error.message : String(error);
        this.notify?.(`Write failed: ${message}`, "error");
      } finally {
        this.pending = false;
        this.requestRender();
        if (this.closeAfterWrite) {
          this.closeAfterWrite = false;
          this.done();
        }
      }
    })();
    return this.pendingWrite.then(() => committed);
  }
  async waitForWrites() {
    await this.pendingWrite;
  }
  sessionResult() {
    return { ...this.result };
  }
}
function settingsTheme(theme) {
  return {
    label: (text, selected) => (selected ? (theme.fg?.("accent", text) ?? text) : text),
    value: (text, selected) => (selected ? (theme.fg?.("accent", text) ?? text) : text),
    description: (text) => theme.fg?.("muted", text) ?? text,
    cursor: theme.fg?.("accent", "› ") ?? "› ",
    hint: (text) => theme.fg?.("dim", text) ?? text,
  };
}
function selectTheme(theme) {
  return {
    selectedPrefix: (text) => theme.fg?.("accent", text) ?? text,
    selectedText: (text) => theme.fg?.("accent", text) ?? text,
    description: (text) => theme.fg?.("muted", text) ?? text,
    scrollInfo: (text) => theme.fg?.("dim", text) ?? text,
    noMatch: (text) => theme.fg?.("warning", text) ?? text,
  };
}
function panelLines(title, body, width, theme, pending) {
  const border = theme.fg?.("border", "─".repeat(Math.max(1, width))) ?? "─".repeat(Math.max(1, width));
  const titleText = theme.fg?.("accent", theme.bold?.(title) ?? title) ?? title;
  const lines = [truncateToWidth(border, width, ""), truncateToWidth(titleText, width, ""), ...body];
  if (pending) lines.push(truncateToWidth(theme.fg?.("dim", "  Saving…") ?? "  Saving…", width, ""));
  lines.push(truncateToWidth(border, width, ""));
  return lines;
}
class SettingsPanel {
  title;
  entries;
  theme;
  coordinator;
  onCancel;
  list;
  constructor(title, entries, theme, coordinator, onCancel) {
    this.title = title;
    this.entries = entries;
    this.theme = theme;
    this.coordinator = coordinator;
    this.onCancel = onCancel;
    this.list = this.createList();
  }
  createList() {
    const hostItems = this.entries.map((entry) => {
      const inactive = entry.inactive();
      const currentValue = entry.currentValue();
      const inactiveSuffix = inactive && !currentValue.includes("inactive") ? " · inactive" : "";
      const dim = (text) => (inactive ? (this.theme.fg?.("dim", text) ?? text) : text);
      const item = {
        id: entry.id,
        label: dim(entry.label),
        description: entry.description,
        currentValue: dim(`${currentValue}${inactiveSuffix}`),
      };
      if (inactive) return item;
      if (entry.children) {
        item.submenu = (_currentValue, done) =>
          new SettingsPanel(`${this.title} › ${entry.label}`, entry.children(), this.theme, this.coordinator, () => {
            this.refresh();
            done();
          });
      } else if (entry.choices?.length) {
        item.submenu = (_currentValue, done) =>
          new ChoiceEditor(entry, `${this.title} › ${entry.label}`, this.theme, this.coordinator, () => {
            this.refresh();
            done();
          });
      } else if (entry.edit) {
        item.submenu = (_currentValue, done) =>
          new InputEditor(entry, `${this.title} › ${entry.label}`, this.theme, this.coordinator, () => {
            this.refresh();
            done();
          });
      }
      return item;
    });
    return new SettingsList(
      hostItems,
      Math.min(hostItems.length + 2, 18),
      settingsTheme(this.theme),
      () => {},
      this.onCancel,
      {
        enableSearch: true,
      },
    );
  }
  refresh() {
    this.list = this.createList();
    this.coordinator.requestRenderNow();
  }
  render(width) {
    return panelLines(this.title, this.list.render(width), width, this.theme, this.coordinator.pending);
  }
  handleInput(data) {
    this.list.handleInput(data);
  }
  invalidate() {
    this.list.invalidate();
  }
}
class ChoiceEditor {
  entry;
  title;
  theme;
  coordinator;
  done;
  list;
  constructor(entry, title, theme, coordinator, done) {
    this.entry = entry;
    this.title = title;
    this.theme = theme;
    this.coordinator = coordinator;
    this.done = done;
    const choices = entry.choices ?? [];
    const items = choices.map((choice) => ({
      value: choice.key,
      label: choice.label,
      description: choice.description,
    }));
    this.list = new SelectList(items, Math.min(items.length, 12), selectTheme(theme));
    const selectedIndex = choices.findIndex((choice) => choice.key === entry.currentChoiceKey?.());
    this.list.setSelectedIndex(Math.max(0, selectedIndex));
    this.list.onSelect = (selected) => {
      const choice = choices.find((candidate) => candidate.key === selected.value);
      if (!choice) return;
      void this.coordinator.commit(this.entry, choice.value).then((committed) => {
        if (committed) this.done();
      });
    };
    this.list.onCancel = this.done;
  }
  render(width) {
    return panelLines(this.title, this.list.render(width), width, this.theme, this.coordinator.pending);
  }
  handleInput(data) {
    this.list.handleInput(data);
  }
  invalidate() {
    this.list.invalidate();
  }
}
class InputEditor {
  entry;
  title;
  theme;
  coordinator;
  done;
  message = "";
  input = new Input();
  constructor(entry, title, theme, coordinator, done) {
    this.entry = entry;
    this.title = title;
    this.theme = theme;
    this.coordinator = coordinator;
    this.done = done;
    const initialValue = entry.edit?.initialValue() ?? "";
    if (initialValue) this.input.handleInput(initialValue);
    this.coordinator.setActiveInput(this.input);
    this.input.onEscape = () => this.close();
    this.input.onSubmit = (text) => {
      let value;
      try {
        value = this.entry.edit?.parse(text) ?? text;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.message = `Invalid value: ${message}`;
        return;
      }
      void this.coordinator.commit(this.entry, value).then((committed) => {
        if (committed) this.close();
      });
    };
  }
  close() {
    this.coordinator.setActiveInput(null);
    this.done();
  }
  render(width) {
    const descriptionWidth = Math.max(1, width - 4);
    const description = wrapTextWithAnsi(this.entry.description, descriptionWidth).map((line) => `  ${line}`);
    const body = [...description, "", ...this.input.render(width)];
    if (this.message)
      body.push("", truncateToWidth(this.theme.fg?.("warning", this.message) ?? this.message, width, ""));
    body.push(
      "",
      truncateToWidth(
        this.theme.fg?.("dim", "  Enter to save · Esc to cancel") ?? "  Enter to save · Esc to cancel",
        width,
        "",
      ),
    );
    return panelLines(this.title, body, width, this.theme, this.coordinator.pending);
  }
  handleInput(data) {
    this.input.handleInput(data);
  }
  invalidate() {
    this.input.invalidate();
  }
}
export class PiSettingsComponent {
  coordinator;
  component;
  constructor(options) {
    this.coordinator = new SettingsCoordinator(options.requestRender, options.notify, options.done);
    const close = () => this.coordinator.requestClose();
    this.component = options.initialChoice
      ? new ChoiceEditor(options.initialChoice, options.title, options.theme, this.coordinator, close)
      : new SettingsPanel(options.title, options.entries, options.theme, this.coordinator, close);
  }
  get focused() {
    return this.coordinator.focused;
  }
  set focused(value) {
    this.coordinator.focused = value;
  }
  render(width) {
    return this.component.render(width);
  }
  handleInput(data) {
    if (this.coordinator.pending) {
      if (matchesKey(data, "escape")) this.coordinator.requestClose();
      return;
    }
    this.component.handleInput?.(data);
    this.coordinator.requestRenderNow();
  }
  invalidate() {
    this.component.invalidate();
  }
  async waitForWrites() {
    await this.coordinator.waitForWrites();
  }
  sessionResult() {
    return this.coordinator.sessionResult();
  }
}
