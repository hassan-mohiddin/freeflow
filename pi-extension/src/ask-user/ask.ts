import { QuestionForm, type FormOptions } from "./form.js";
import type { Answer, AskOutcome, Question } from "./questions.js";

/*
 * Putting questions to the user in whatever UI the session has:
 * - the terminal: one QuestionForm (descriptions, own answer, notes, multi-select);
 * - RPC clients: one `select` per question (option and description on one line) and an `input` for the user's own
 *   answer; multi-select repeats `select` until the user picks Done;
 * - no UI (print, JSON): unavailable, so the caller asks in its reply.
 * Closing any dialog without answering dismisses the whole question.
 */

const OWN = "Type my own answer";
const DONE = "Done";

export async function askUser(
  ctx: any,
  questions: readonly Question[],
  signal?: AbortSignal,
  form: FormOptions = {},
): Promise<AskOutcome> {
  if (!ctx?.hasUI || !ctx.ui) return { status: "unavailable", reason: "No one can answer a dialog in this session." };
  if (ctx.mode === "tui" && typeof ctx.ui.custom === "function") {
    let timer: ReturnType<typeof setInterval> | undefined;
    const outcome = await ctx.ui.custom(
      (tui: any, theme: any, _keybindings: unknown, done: (outcome: AskOutcome) => void) => {
        const view = new QuestionForm(questions, theme, done, () => tui?.requestRender?.(), form);
        // A dialog with a deadline counts down and closes itself unanswered when it passes.
        if (form.deadline !== undefined)
          timer = setInterval(() => {
            if (Date.now() >= form.deadline!) done({ status: "dismissed" });
            else {
              view.invalidate();
              tui?.requestRender?.();
            }
          }, 1000);
        return view;
      },
    );
    if (timer) clearInterval(timer);
    return outcome ?? { status: "dismissed" };
  }
  const answers: Answer[] = [];
  for (const question of questions) {
    const answer = await askOne(ctx, question, signal);
    if (!answer) return { status: "dismissed" };
    answers.push(answer);
  }
  return { status: "answered", answers };
}

async function askOne(ctx: any, question: Question, signal?: AbortSignal): Promise<Answer | undefined> {
  const title = `${question.header} · ${question.question}`;
  const labels = question.options.map((option) =>
    option.description ? `${option.label} — ${option.description}` : option.label,
  );
  const base = { header: question.header, question: question.question };
  const own = async () => {
    const text = (await ctx.ui.input(title, "Your answer", signal ? { signal } : undefined))?.trim();
    return text ? { ...base, selected: [], text } : undefined;
  };
  if (!question.multiSelect) {
    const choice = await ctx.ui.select(title, [...labels, OWN], signal ? { signal } : undefined);
    if (choice === undefined) return undefined;
    if (choice === OWN) return own();
    return { ...base, selected: [question.options[labels.indexOf(choice)].label] };
  }
  const picked = new Set<number>();
  for (;;) {
    const shown = labels.map((label, at) => `${picked.has(at) ? "[x]" : "[ ]"} ${label}`);
    const choice = await ctx.ui.select(
      `${title} (choose one or more, then ${DONE})`,
      [...shown, OWN, ...(picked.size ? [DONE] : [])],
      signal ? { signal } : undefined,
    );
    if (choice === undefined) return undefined;
    if (choice === OWN) return own();
    if (choice === DONE)
      return { ...base, selected: [...picked].sort((a, b) => a - b).map((at) => question.options[at].label) };
    const at = shown.indexOf(choice);
    if (picked.has(at)) picked.delete(at);
    else picked.add(at);
  }
}

/**
 * A yes-or-no question in the same dialog as ask_user, for Freeflow's own confirmations (task memory's proposals).
 * Outside the terminal it is Pi's confirm, unchanged; without a UI it is false.
 */
export async function confirmWithUser(
  ctx: any,
  title: string,
  message: string,
  options: { timeoutMs?: number; yes?: string; no?: string } = {},
): Promise<boolean> {
  if (!ctx?.hasUI || !ctx.ui) return false;
  if (ctx.mode !== "tui" || typeof ctx.ui.custom !== "function")
    return Boolean(
      await ctx.ui.confirm(
        title,
        message,
        ...(options.timeoutMs !== undefined ? [{ timeout: options.timeoutMs }] : []),
      ),
    );
  const header = title.replace(/\?$/, "").slice(0, 40);
  const yes = options.yes ?? "Yes";
  const outcome = await askUser(
    ctx,
    [{ question: message, header, options: [{ label: yes }, { label: options.no ?? "No" }] }],
    undefined,
    {
      ownAnswer: false,
      notes: false,
      ...(options.timeoutMs !== undefined ? { deadline: Date.now() + options.timeoutMs } : {}),
    },
  );
  return outcome.status === "answered" && outcome.answers[0]?.selected[0] === yes;
}
