import {
  Input,
  matchesKey,
  SelectList,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
  type Focusable,
  type SelectItem,
  type SelectListTheme,
} from "@earendil-works/pi-tui";

/*
 * The terminal widgets behind /freeflow settings: the settings list, choice picker, wizard, and text input. They
 * render entries and report the user's changes; they know nothing about Freeflow configuration.
 */
export type SettingsCommitResult = {
  changed: boolean;
  reloadRequired: boolean;
};

export type SettingsSessionResult = {
  changed: boolean;
  configChanged: boolean;
  failed: boolean;
};

export type SettingsChoice = {
  key: string;
  value: unknown;
  label: string;
  description?: string;
};

export type SettingsWizardStep = {
  title: string;
  choices: SettingsChoice[];
  selectedKey?: string;
};

export type SettingsWizard = {
  firstStep: () => SettingsWizardStep;
  nextStep: (selectedValues: unknown[]) => SettingsWizardStep | undefined;
  valueFromSelections: (selectedValues: unknown[]) => unknown;
};

export type SettingsEntry = {
  id: string;
  label: string;
  description: string;
  currentValue: () => string;
  inactive: () => boolean;
  /** A section header: not selectable; its current value is shown as the section's status. */
  section?: boolean;
  /** Enter/Space moves to the next choice in place instead of opening a picker. */
  cycle?: boolean;
  currentChoiceKey?: () => string;
  choices?: SettingsChoice[];
  children?: () => SettingsEntry[];
  wizard?: () => SettingsWizard;
  edit?: {
    initialValue: () => string;
    parse: (text: string) => unknown;
  };
  commit?: (value: unknown) => Promise<SettingsCommitResult>;
};

type Theme = {
  fg?: (color: string, text: string) => string;
  bold?: (text: string) => string;
};

/** One scope of settings, such as Session, Personal or Repository; Tab switches between scopes. */
export type SettingsScope = {
  id: string;
  label: string;
  /** One line saying where this scope's values live and whom they affect. */
  summary: string;
  load: () => Promise<SettingsEntry[]> | SettingsEntry[];
};

type SettingsTuiOptions = {
  title: string;
  entries?: SettingsEntry[];
  scopes?: SettingsScope[];
  initialScope?: string;
  initialChoice?: SettingsEntry;
  theme: Theme;
  requestRender: () => void;
  notify?: (message: string, level: string) => void;
  done: (value?: undefined) => void;
};

class SettingsCoordinator {
  private activeInput: Input | null = null;
  private closeAfterWrite = false;
  private focusedValue = false;
  private pendingWrite: Promise<void> = Promise.resolve();
  private result: SettingsSessionResult = {
    changed: false,
    configChanged: false,
    failed: false,
  };

  pending = false;

  constructor(
    private readonly requestRender: () => void,
    private readonly notify: ((message: string, level: string) => void) | undefined,
    private readonly done: (value?: undefined) => void,
  ) {}

  get focused() {
    return this.focusedValue;
  }

  set focused(value: boolean) {
    this.focusedValue = value;
    if (this.activeInput) this.activeInput.focused = value;
  }

  setActiveInput(input: Input | null) {
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

  notifyError(message: string) {
    this.notify?.(message, "error");
    this.requestRender();
  }

  commit(entry: SettingsEntry, value: unknown): Promise<boolean> {
    if (this.pending || !entry.commit) return Promise.resolve(false);

    this.pending = true;
    this.requestRender();
    let committed = false;
    this.pendingWrite = (async () => {
      try {
        const outcome = await entry.commit!(value);
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

  sessionResult(): SettingsSessionResult {
    return { ...this.result };
  }
}

function selectTheme(theme: Theme): SelectListTheme {
  return {
    selectedPrefix: (text) => theme.fg?.("accent", text) ?? text,
    selectedText: (text) => theme.fg?.("accent", text) ?? text,
    description: (text) => theme.fg?.("muted", text) ?? text,
    scrollInfo: (text) => theme.fg?.("dim", text) ?? text,
    noMatch: (text) => theme.fg?.("warning", text) ?? text,
  };
}

function panelLines(title: string, body: string[], width: number, theme: Theme, pending: boolean): string[] {
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
class SettingsScreen implements Component {
  private scopeIndex = 0;
  private entries: SettingsEntry[] = [];
  private selected = 0;
  private loading = false;
  private submenu: Component | null = null;

  constructor(
    private readonly title: string,
    private readonly scopes: SettingsScope[],
    private readonly theme: Theme,
    private readonly coordinator: SettingsCoordinator,
    private readonly onCancel: () => void,
    initialScope?: string,
  ) {
    this.scopeIndex = Math.max(
      0,
      scopes.findIndex((scope) => scope.id === initialScope),
    );
    this.load();
  }

  /** Entries already at hand show at once; a scope read from disk shows "Loading…" until it arrives. */
  private load(): void {
    const loaded = this.scopes[this.scopeIndex]!.load();
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

  private show(entries: SettingsEntry[]) {
    this.entries = entries;
    this.loading = false;
    this.selected = this.firstSelectable(0, 1);
    this.coordinator.requestRenderNow();
  }

  /** Settle any pending scope load; tests and callers that render synchronously use this. */
  async ready() {
    while (this.loading) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  private firstSelectable(from: number, step: 1 | -1): number {
    const count = this.entries.length;
    for (let i = 0; i < count; i++) {
      const index = (((from + i * step) % count) + count) % count;
      if (!this.entries[index]?.section) return index;
    }
    return 0;
  }

  private move(step: 1 | -1) {
    this.selected = this.firstSelectable(this.selected + step, step);
  }

  private switchScope(step: 1 | -1) {
    if (this.scopes.length < 2 || this.coordinator.pending) return;
    this.scopeIndex = (this.scopeIndex + step + this.scopes.length) % this.scopes.length;
    this.load();
  }

  private closeSubmenu = () => {
    this.submenu = null;
    this.coordinator.requestRenderNow();
  };

  private activate() {
    const entry = this.entries[this.selected];
    if (!entry || entry.section || entry.inactive()) return;
    const title = `${this.title} › ${this.scopes[this.scopeIndex]!.label} › ${entry.label}`;
    if (entry.cycle && entry.choices?.length) {
      const choices = entry.choices;
      const current = choices.findIndex((choice) => choice.key === entry.currentChoiceKey?.());
      const next = choices[(current + 1) % choices.length]!;
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

  handleInput(data: string) {
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

  private color(name: string, text: string) {
    return this.theme.fg?.(name, text) ?? text;
  }

  private header(width: number): string[] {
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
      truncateToWidth(this.color("muted", `  ${this.scopes[this.scopeIndex]!.summary}`), width, ""),
    ];
  }

  private rows(width: number): string[] {
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

  private details(width: number): string[] {
    const entry = this.entries[this.selected];
    if (!entry || this.loading) return [];
    const wrap = (text: string, color: string) =>
      wrapTextWithAnsi(text, Math.max(1, width - 4)).map((line) => this.color(color, `  ${line}`));
    const lines = wrap(entry.description, "muted");
    const choice = entry.cycle
      ? entry.choices?.find((candidate) => candidate.key === entry.currentChoiceKey?.())
      : undefined;
    if (choice?.description) lines.push(...wrap(`${choice.label}: ${choice.description}`, "dim"));
    return lines;
  }

  render(width: number): string[] {
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

class ChoiceEditor implements Component {
  private readonly list: SelectList;

  constructor(
    private readonly entry: SettingsEntry,
    private readonly title: string,
    private readonly theme: Theme,
    private readonly coordinator: SettingsCoordinator,
    private readonly done: () => void,
  ) {
    const choices = entry.choices ?? [];
    const items: SelectItem[] = choices.map((choice) => ({
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

  render(width: number): string[] {
    return panelLines(this.title, this.list.render(width), width, this.theme, this.coordinator.pending);
  }

  handleInput(data: string) {
    this.list.handleInput(data);
  }

  invalidate() {
    this.list.invalidate();
  }
}

class WizardEditor implements Component {
  private readonly wizard: SettingsWizard;
  private selectedValues: unknown[] = [];
  private list: SelectList;
  private stepTitle: string;

  constructor(
    private readonly entry: SettingsEntry,
    private readonly title: string,
    private readonly theme: Theme,
    private readonly coordinator: SettingsCoordinator,
    private readonly done: () => void,
  ) {
    this.wizard = entry.wizard!();
    const firstStep = this.wizard.firstStep();
    this.stepTitle = firstStep.title;
    this.list = this.createList(firstStep);
  }

  private createList(step: SettingsWizardStep): SelectList {
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

  render(width: number): string[] {
    return panelLines(
      `${this.title} › ${this.stepTitle}`,
      this.list.render(width),
      width,
      this.theme,
      this.coordinator.pending,
    );
  }

  handleInput(data: string) {
    this.list.handleInput(data);
  }

  invalidate() {
    this.list.invalidate();
  }
}

class InputEditor implements Component {
  private message = "";
  private readonly input = new Input();

  constructor(
    private readonly entry: SettingsEntry,
    private readonly title: string,
    private readonly theme: Theme,
    private readonly coordinator: SettingsCoordinator,
    private readonly done: () => void,
  ) {
    const initialValue = entry.edit?.initialValue() ?? "";
    if (initialValue) this.input.handleInput(initialValue);
    this.coordinator.setActiveInput(this.input);
    this.input.onEscape = () => this.close();
    this.input.onSubmit = (text) => {
      let value: unknown;
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

  private close() {
    this.coordinator.setActiveInput(null);
    this.done();
  }

  render(width: number): string[] {
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

  handleInput(data: string) {
    this.input.handleInput(data);
  }

  invalidate() {
    this.input.invalidate();
  }
}

export class PiSettingsComponent implements Component, Focusable {
  private readonly coordinator: SettingsCoordinator;
  private readonly component: Component;

  constructor(options: SettingsTuiOptions) {
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

  set focused(value: boolean) {
    this.coordinator.focused = value;
  }

  render(width: number): string[] {
    return this.component.render(width);
  }

  handleInput(data: string) {
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
