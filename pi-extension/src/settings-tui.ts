import {
  Input,
  matchesKey,
  SelectList,
  SettingsList,
  truncateToWidth,
  wrapTextWithAnsi,
  type Component,
  type Focusable,
  type SelectItem,
  type SelectListTheme,
  type SettingItem,
  type SettingsListTheme,
} from "@earendil-works/pi-tui";

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

export type SettingsEntry = {
  id: string;
  label: string;
  description: string;
  currentValue: () => string;
  inactive: () => boolean;
  currentChoiceKey?: () => string;
  choices?: SettingsChoice[];
  children?: () => SettingsEntry[];
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

type SettingsTuiOptions = {
  title: string;
  entries: SettingsEntry[];
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

function settingsTheme(theme: Theme): SettingsListTheme {
  return {
    label: (text, selected) => (selected ? (theme.fg?.("accent", text) ?? text) : text),
    value: (text, selected) => (selected ? (theme.fg?.("accent", text) ?? text) : text),
    description: (text) => theme.fg?.("muted", text) ?? text,
    cursor: theme.fg?.("accent", "› ") ?? "› ",
    hint: (text) => theme.fg?.("dim", text) ?? text,
  };
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

class SettingsPanel implements Component {
  private list: SettingsList;

  constructor(
    private readonly title: string,
    private readonly entries: SettingsEntry[],
    private readonly theme: Theme,
    private readonly coordinator: SettingsCoordinator,
    private readonly onCancel: () => void,
  ) {
    this.list = this.createList();
  }

  private createList() {
    const hostItems = this.entries.map((entry): SettingItem => {
      const inactive = entry.inactive();
      const currentValue = entry.currentValue();
      const inactiveSuffix = inactive && !currentValue.includes("inactive") ? " · inactive" : "";
      const dim = (text: string) => (inactive ? (this.theme.fg?.("dim", text) ?? text) : text);
      const item: SettingItem = {
        id: entry.id,
        label: dim(entry.label),
        description: entry.description,
        currentValue: dim(`${currentValue}${inactiveSuffix}`),
      };

      if (inactive) return item;

      if (entry.children) {
        item.submenu = (_currentValue, done) =>
          new SettingsPanel(`${this.title} › ${entry.label}`, entry.children!(), this.theme, this.coordinator, () => {
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
    this.component = options.initialChoice
      ? new ChoiceEditor(options.initialChoice, options.title, options.theme, this.coordinator, close)
      : new SettingsPanel(options.title, options.entries, options.theme, this.coordinator, close);
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

  sessionResult() {
    return this.coordinator.sessionResult();
  }
}
