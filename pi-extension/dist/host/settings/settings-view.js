import { Input, matchesKey, SelectList, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
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
  notifyError(message) {
    this.notify?.(message, "error");
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
const HINT_KEYS = "↑↓ move · Enter/Space change · Esc close";
const MAX_ROWS = 18;
/**
 * The settings screen: one list per scope, with section headers, values changed in place where they are small choices,
 * and Tab between scopes. Pickers for presets, free text, and confirmations open over it and return to it.
 */
class SettingsScreen {
  title;
  scopes;
  theme;
  coordinator;
  onCancel;
  scopeIndex = 0;
  entries = [];
  selected = 0;
  loading = false;
  submenu = null;
  constructor(title, scopes, theme, coordinator, onCancel, initialScope) {
    this.title = title;
    this.scopes = scopes;
    this.theme = theme;
    this.coordinator = coordinator;
    this.onCancel = onCancel;
    this.scopeIndex = Math.max(
      0,
      scopes.findIndex((scope) => scope.id === initialScope),
    );
    this.load();
  }
  /** Entries already at hand show at once; a scope read from disk shows "Loading…" until it arrives. */
  load() {
    const loaded = this.scopes[this.scopeIndex].load();
    if (!(loaded instanceof Promise)) {
      this.show(loaded);
      return;
    }
    this.loading = true;
    this.coordinator.requestRenderNow();
    void loaded
      .then((entries) => this.show(entries))
      .catch((error) => {
        this.loading = false;
        this.entries = [];
        this.coordinator.notifyError(
          `Could not load settings: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }
  show(entries) {
    this.entries = entries;
    this.loading = false;
    this.selected = this.firstSelectable(0, 1);
    this.coordinator.requestRenderNow();
  }
  /** Settle any pending scope load; tests and callers that render synchronously use this. */
  async ready() {
    while (this.loading) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  firstSelectable(from, step) {
    const count = this.entries.length;
    for (let i = 0; i < count; i++) {
      const index = (((from + i * step) % count) + count) % count;
      if (!this.entries[index]?.section) return index;
    }
    return 0;
  }
  move(step) {
    this.selected = this.firstSelectable(this.selected + step, step);
  }
  switchScope(step) {
    if (this.scopes.length < 2 || this.coordinator.pending) return;
    this.scopeIndex = (this.scopeIndex + step + this.scopes.length) % this.scopes.length;
    this.load();
  }
  closeSubmenu = () => {
    this.submenu = null;
    this.coordinator.requestRenderNow();
  };
  activate() {
    const entry = this.entries[this.selected];
    if (!entry || entry.section || entry.inactive()) return;
    const title = `${this.title} › ${this.scopes[this.scopeIndex].label} › ${entry.label}`;
    if (entry.cycle && entry.choices?.length) {
      const choices = entry.choices;
      const current = choices.findIndex((choice) => choice.key === entry.currentChoiceKey?.());
      const next = choices[(current + 1) % choices.length];
      void this.coordinator.commit(entry, next.value);
      return;
    }
    if (entry.wizard) this.submenu = new WizardEditor(entry, title, this.theme, this.coordinator, this.closeSubmenu);
    else if (entry.choices?.length)
      this.submenu = new ChoiceEditor(entry, title, this.theme, this.coordinator, this.closeSubmenu);
    else if (entry.edit) this.submenu = new InputEditor(entry, title, this.theme, this.coordinator, this.closeSubmenu);
    else if (entry.children) {
      const children = entry.children();
      this.submenu = new SettingsScreen(
        title,
        [{ id: entry.id, label: entry.label, summary: entry.description, load: () => children }],
        this.theme,
        this.coordinator,
        this.closeSubmenu,
      );
    }
  }
  handleInput(data) {
    if (this.submenu) {
      this.submenu.handleInput?.(data);
      return;
    }
    if (matchesKey(data, "up")) this.move(-1);
    else if (matchesKey(data, "down")) this.move(1);
    else if (matchesKey(data, "tab")) this.switchScope(1);
    else if (matchesKey(data, "shift+tab")) this.switchScope(-1);
    else if (matchesKey(data, "enter") || data === " ") this.activate();
    else if (matchesKey(data, "escape")) this.onCancel();
  }
  color(name, text) {
    return this.theme.fg?.(name, text) ?? text;
  }
  header(width) {
    const title = this.color("accent", this.theme.bold?.(this.title) ?? this.title);
    if (this.scopes.length < 2) return [truncateToWidth(title, width, "")];
    const tabs = this.scopes
      .map((scope, index) =>
        index === this.scopeIndex
          ? this.color("accent", this.theme.bold?.(`[${scope.label}]`) ?? `[${scope.label}]`)
          : this.color("dim", ` ${scope.label} `),
      )
      .join(" ");
    return [
      truncateToWidth(`${title}   ${tabs}`, width, ""),
      truncateToWidth(this.color("muted", `  ${this.scopes[this.scopeIndex].summary}`), width, ""),
    ];
  }
  rows(width) {
    if (this.loading) return [this.color("dim", "  Loading…")];
    if (!this.entries.length) return [this.color("dim", "  No settings in this scope.")];
    const items = this.entries.filter((entry) => !entry.section);
    const labelWidth = Math.min(32, Math.max(...items.map((entry) => visibleWidth(entry.label))));
    const lines = this.entries.map((entry, index) => {
      if (entry.section) {
        const status = entry.currentValue();
        const label = this.color("accent", this.theme.bold?.(entry.label) ?? entry.label);
        return truncateToWidth(`  ${label}${status ? this.color("dim", `  ${status}`) : ""}`, width, "");
      }
      const selected = index === this.selected;
      const inactive = entry.inactive();
      const cursor = selected ? this.color("accent", "› ") : "  ";
      const padded = entry.label + " ".repeat(Math.max(0, labelWidth - visibleWidth(entry.label)));
      const label = selected ? this.color("accent", padded) : inactive ? this.color("dim", padded) : padded;
      const value = entry.currentValue() + (inactive ? " · inactive" : "");
      const shown = selected ? this.color("accent", value) : inactive ? this.color("dim", value) : value;
      return truncateToWidth(`  ${cursor}${label}  ${shown}`, width, "");
    });
    if (lines.length <= MAX_ROWS) return lines;
    const start = Math.max(0, Math.min(this.selected - Math.floor(MAX_ROWS / 2), lines.length - MAX_ROWS));
    return [...lines.slice(start, start + MAX_ROWS), this.color("dim", `  (${this.selected + 1}/${lines.length})`)];
  }
  details(width) {
    const entry = this.entries[this.selected];
    if (!entry || this.loading) return [];
    const wrap = (text, color) =>
      wrapTextWithAnsi(text, Math.max(1, width - 4)).map((line) => this.color(color, `  ${line}`));
    const lines = wrap(entry.description, "muted");
    const choice = entry.cycle
      ? entry.choices?.find((candidate) => candidate.key === entry.currentChoiceKey?.())
      : undefined;
    if (choice?.description) lines.push(...wrap(`${choice.label}: ${choice.description}`, "dim"));
    return lines;
  }
  render(width) {
    if (this.submenu) return this.submenu.render(width);
    const border = this.color("border", "─".repeat(Math.max(1, width)));
    const keys = this.scopes.length > 1 ? HINT_KEYS.replace(" · Esc", " · Tab scope · Esc") : HINT_KEYS;
    const hint = this.coordinator.pending ? "Saving…" : keys;
    return [
      truncateToWidth(border, width, ""),
      ...this.header(width),
      "",
      ...this.rows(width),
      "",
      ...this.details(width),
      "",
      truncateToWidth(this.color("dim", `  ${hint}`), width, ""),
      truncateToWidth(border, width, ""),
    ];
  }
  invalidate() {
    this.submenu?.invalidate?.();
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
class WizardEditor {
  entry;
  title;
  theme;
  coordinator;
  done;
  wizard;
  selectedValues = [];
  list;
  stepTitle;
  constructor(entry, title, theme, coordinator, done) {
    this.entry = entry;
    this.title = title;
    this.theme = theme;
    this.coordinator = coordinator;
    this.done = done;
    this.wizard = entry.wizard();
    const firstStep = this.wizard.firstStep();
    this.stepTitle = firstStep.title;
    this.list = this.createList(firstStep);
  }
  createList(step) {
    const list = new SelectList(
      step.choices.map((choice) => ({
        value: choice.key,
        label: choice.label,
        description: choice.description,
      })),
      Math.min(step.choices.length, 12),
      selectTheme(this.theme),
    );
    const selectedIndex = step.choices.findIndex((choice) => choice.key === step.selectedKey);
    list.setSelectedIndex(Math.max(0, selectedIndex));
    list.onSelect = (selected) => {
      const choice = step.choices.find((candidate) => candidate.key === selected.value);
      if (!choice) return;
      if (choice.key === "__cancel__") {
        this.done();
        return;
      }
      const selectedValues = [...this.selectedValues, choice.value];
      const nextStep = this.wizard.nextStep(selectedValues);
      if (nextStep) {
        this.selectedValues = selectedValues;
        this.stepTitle = nextStep.title;
        this.list = this.createList(nextStep);
        this.coordinator.requestRenderNow();
        return;
      }
      void this.coordinator.commit(this.entry, this.wizard.valueFromSelections(selectedValues)).then((committed) => {
        if (committed) this.done();
      });
    };
    list.onCancel = this.done;
    return list;
  }
  render(width) {
    return panelLines(
      `${this.title} › ${this.stepTitle}`,
      this.list.render(width),
      width,
      this.theme,
      this.coordinator.pending,
    );
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
    const scopes = options.scopes ?? [
      { id: "settings", label: options.title, summary: "", load: () => options.entries ?? [] },
    ];
    this.component = options.initialChoice
      ? new ChoiceEditor(options.initialChoice, options.title, options.theme, this.coordinator, close)
      : new SettingsScreen(options.title, scopes, options.theme, this.coordinator, close, options.initialScope);
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
  /** Resolves once the current scope's settings are loaded. */
  async ready() {
    if (this.component instanceof SettingsScreen) await this.component.ready();
  }
  sessionResult() {
    return this.coordinator.sessionResult();
  }
}
