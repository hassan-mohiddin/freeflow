import {
  Input,
  Key,
  matchesKey,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
  type Focusable,
} from "@earendil-works/pi-tui";
import type { Answer, AskOutcome, Question } from "./questions.js";

/*
 * The terminal dialog for ask_user, adapted from Pi's questionnaire example: one question as a list, several as tabs
 * with a Submit tab. Each question lists its options with their descriptions, then a row for the user's own answer;
 * multi-select questions toggle with Space; `n` adds a note to the current question; Esc closes the dialog
 * unanswered. It renders and reports the answers; it knows nothing about how they are used.
 */

type Theme = {
  fg(color: string, text: string): string;
  bold(text: string): string;
  bg?(color: string, text: string): string;
};

/** What the form offers beyond the options: the user's own answer and notes (both on for ask_user). */
export interface FormOptions {
  ownAnswer?: boolean;
  notes?: boolean;
  /** When the dialog closes on its own (epoch ms), shown as a countdown; the caller closes it then. */
  deadline?: number;
}

const OWN_ANSWER = "Type my own answer";

export class QuestionForm implements Component, Focusable {
  private tab = 0;
  private readonly cursor: number[];
  private readonly picked: Set<number>[];
  private readonly written = new Map<number, string>();
  private readonly notes = new Map<number, string>();
  private readonly answered = new Set<number>();
  private mode: "choose" | "own" | "note" = "choose";
  private readonly input = new Input();
  private cache: string[] | undefined;
  private focusedValue = false;

  constructor(
    private readonly questions: readonly Question[],
    private readonly theme: Theme,
    private readonly done: (outcome: AskOutcome) => void,
    private readonly requestRender: () => void = () => {},
    private readonly options: FormOptions = {},
  ) {
    this.cursor = questions.map(() => 0);
    this.picked = questions.map(() => new Set<number>());
    this.input.onSubmit = (value) => this.submitInput(value);
    this.input.onEscape = () => this.leaveInput();
  }

  get focused(): boolean {
    return this.focusedValue;
  }
  set focused(value: boolean) {
    this.focusedValue = value;
    this.input.focused = value && this.mode !== "choose";
  }

  private get many(): boolean {
    return this.questions.length > 1;
  }
  private get onSubmitTab(): boolean {
    return this.many && this.tab === this.questions.length;
  }
  private get ownAnswer(): boolean {
    return this.options.ownAnswer !== false;
  }
  private rows(index: number): number {
    return this.questions[index].options.length + (this.ownAnswer ? 1 : 0);
  }

  private refresh(): void {
    this.cache = undefined;
    this.requestRender();
  }

  private finish(): void {
    const answers: Answer[] = this.questions.map((question, index) => {
      const note = this.notes.get(index);
      const text = this.written.get(index);
      return {
        header: question.header,
        question: question.question,
        selected:
          text === undefined
            ? [...this.picked[index]].sort((a, b) => a - b).map((at) => question.options[at].label)
            : [],
        ...(text === undefined ? {} : { text }),
        ...(note ? { note } : {}),
      };
    });
    this.done({ status: "answered", answers });
  }

  /** After a question is answered: the next unanswered question, the Submit tab, or done for a single question. */
  private advance(): void {
    this.answered.add(this.tab);
    if (!this.many) return this.finish();
    const next = this.questions.findIndex((_, index) => !this.answered.has(index));
    this.tab = next === -1 ? this.questions.length : next;
    this.refresh();
  }

  private submitInput(value: string): void {
    const text = value.trim();
    if (this.mode === "own") {
      if (!text) return;
      this.written.set(this.tab, text);
      this.picked[this.tab].clear();
      this.leaveInput(false);
      this.advance();
      return;
    }
    if (text) this.notes.set(this.tab, text);
    else this.notes.delete(this.tab);
    this.leaveInput();
  }

  private leaveInput(render = true): void {
    this.mode = "choose";
    this.input.setValue("");
    this.input.focused = false;
    if (render) this.refresh();
  }

  private enterInput(mode: "own" | "note"): void {
    this.mode = mode;
    this.input.setValue(mode === "note" ? (this.notes.get(this.tab) ?? "") : (this.written.get(this.tab) ?? ""));
    this.input.focused = this.focusedValue;
    this.refresh();
  }

  handleInput(data: string): void {
    if (this.mode !== "choose") {
      this.input.handleInput(data);
      this.refresh();
      return;
    }
    if (matchesKey(data, Key.escape)) return this.done({ status: "dismissed" });
    if (this.many && (matchesKey(data, Key.tab) || matchesKey(data, Key.right))) {
      this.tab = (this.tab + 1) % (this.questions.length + 1);
      return this.refresh();
    }
    if (this.many && (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left))) {
      this.tab = (this.tab + this.questions.length) % (this.questions.length + 1);
      return this.refresh();
    }
    if (this.onSubmitTab) {
      if (matchesKey(data, Key.enter) && this.answered.size === this.questions.length) this.finish();
      return;
    }
    const question = this.questions[this.tab];
    const at = this.cursor[this.tab];
    const own = at === question.options.length;
    if (matchesKey(data, Key.up)) {
      this.cursor[this.tab] = Math.max(0, at - 1);
      return this.refresh();
    }
    if (matchesKey(data, Key.down)) {
      this.cursor[this.tab] = Math.min(this.rows(this.tab) - 1, at + 1);
      return this.refresh();
    }
    if (data === "n" && this.options.notes !== false) return this.enterInput("note");
    if (question.multiSelect && data === " " && !own) {
      const picked = this.picked[this.tab];
      if (picked.has(at)) picked.delete(at);
      else picked.add(at);
      this.written.delete(this.tab);
      this.answered.delete(this.tab);
      return this.refresh();
    }
    if (matchesKey(data, Key.enter)) {
      if (own) return this.enterInput("own");
      const picked = this.picked[this.tab];
      if (!question.multiSelect) {
        picked.clear();
        picked.add(at);
      } else if (picked.size === 0) picked.add(at);
      this.written.delete(this.tab);
      this.advance();
    }
  }

  invalidate(): void {
    this.cache = undefined;
  }

  render(width: number): string[] {
    if (this.cache) return this.cache;
    const t = this.theme;
    const w = Math.max(1, width);
    const lines: string[] = [];
    const wrap = (prefix: string, text: string) => {
      const indent = visibleWidth(prefix);
      const body = wrapTextWithAnsi(text, Math.max(1, w - indent));
      body.forEach((line, i) => lines.push(`${i === 0 ? prefix : " ".repeat(indent)}${line}`));
    };
    lines.push(t.fg("accent", "─".repeat(w)));
    if (this.many) {
      const tabs = this.questions.map((question, index) => {
        const label = ` ${this.answered.has(index) ? "■" : "□"} ${question.header} `;
        return index === this.tab
          ? t.bold(t.fg("accent", label))
          : t.fg(this.answered.has(index) ? "success" : "muted", label);
      });
      const ready = this.answered.size === this.questions.length;
      const submit = " ✓ Submit ";
      tabs.push(this.onSubmitTab ? t.bold(t.fg("accent", submit)) : t.fg(ready ? "success" : "dim", submit));
      wrap(" ", tabs.join(" "));
      lines.push("");
    }
    if (this.onSubmitTab) {
      wrap(" ", t.bold("Your answers"));
      lines.push("");
      this.questions.forEach((question, index) => {
        const text = this.written.get(index);
        const chosen = [...this.picked[index]].map((at) => question.options[at].label).join(", ");
        const answer =
          text !== undefined ? `"${text}"` : this.answered.has(index) ? chosen : t.fg("warning", "not answered");
        wrap(" ", `${t.fg("muted", `${question.header}:`)} ${answer}`);
        const note = this.notes.get(index);
        if (note) wrap("   ", t.fg("dim", `note: ${note}`));
      });
      lines.push("");
      wrap(
        " ",
        this.answered.size === this.questions.length
          ? t.fg("success", "Enter to submit")
          : t.fg("warning", "Answer every question to submit"),
      );
    } else {
      const index = this.tab;
      const question = this.questions[index];
      wrap(" ", `${t.fg("muted", `${question.header} ·`)} ${t.bold(question.question)}`);
      lines.push("");
      const rows = [...question.options, ...(this.ownAnswer ? [{ label: OWN_ANSWER }] : [])];
      rows.forEach((option, at) => {
        const own = at === question.options.length;
        const here = at === this.cursor[index] && this.mode === "choose";
        const mark = question.multiSelect && !own ? (this.picked[index].has(at) ? "[x] " : "[ ] ") : "";
        const chosen = !question.multiSelect && !own && this.answered.has(index) && this.picked[index].has(at);
        const label = `${at + 1}. ${mark}${option.label}${chosen ? " ✓" : ""}`;
        wrap(here ? t.fg("accent", "› ") : "  ", here ? t.fg("accent", label) : label);
        const description = own ? this.written.get(index) : (option as { description?: string }).description;
        if (description) wrap("     ", t.fg("muted", own ? `"${description}"` : description));
      });
      const note = this.notes.get(index);
      if (note && this.mode !== "note") {
        lines.push("");
        wrap(" ", t.fg("dim", `Note: ${note}`));
      }
      if (this.mode !== "choose") {
        lines.push("");
        wrap(" ", t.fg("muted", this.mode === "own" ? "Your answer:" : "Note for this question:"));
        for (const line of this.input.render(Math.max(1, w - 2))) lines.push(` ${line}`);
      }
    }
    lines.push("");
    if (this.options.deadline !== undefined) {
      const left = Math.max(0, Math.ceil((this.options.deadline - Date.now()) / 1000));
      wrap(
        " ",
        t.fg("dim", `Closes in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} without an answer`),
      );
    }
    const help =
      this.mode !== "choose"
        ? "Enter to save · Esc to go back"
        : [
            "↑↓ move",
            this.questions[this.tab]?.multiSelect ? "Space toggle · Enter confirm" : "Enter choose",
            ...(this.options.notes !== false ? ["n note"] : []),
            ...(this.many ? ["Tab next"] : []),
            "Esc close without answering",
          ].join(" · ");
    wrap(" ", t.fg("dim", help));
    lines.push(t.fg("accent", "─".repeat(w)));
    this.cache = lines;
    return lines;
  }
}
