import { Text } from "@earendil-works/pi-tui";
import { firstLine, foldRow, paint } from "../host/rows.js";
import { askUser } from "./ask.js";
import {
  MAX_HEADER,
  MAX_OPTIONS,
  MAX_QUESTIONS,
  MIN_OPTIONS,
  outcomeText,
  validateQuestions,
  type AskOutcome,
} from "./questions.js";

export const ASK_USER = "ask_user";

const DESCRIPTION = [
  "Ask the user in a dialog when a choice is theirs to make: what to do, which direction to take, whether to go beyond what they asked. The call waits for their answer.",
  `Ask 1 to ${MAX_QUESTIONS} questions. Each has a full-sentence question, a header of at most ${MAX_HEADER} characters, and ${MIN_OPTIONS} to ${MAX_OPTIONS} options: a label of a few words and a description of what choosing it means. Put your recommended option first and end its label with "(Recommended)". Use multiSelect when the options are not exclusive. The dialog adds a field for the user's own answer and a note, so never list an "Other" option.`,
  "Several questions in one call only when each is the user's and none depends on another's answer. Say any context the choice needs in your reply before calling: the dialog shows only the questions and options.",
  "If the user closes the dialog or no one can answer it, the result says so: then ask in your reply.",
].join("\n\n");

// Pi adds a tool's guidelines to the system prompt's rules while the tool is active.
const GUIDELINE =
  "Use ask_user for a choice that is the user's to make, with the options that matter and your recommendation first; never for facts you can look up or work out.";

export interface AskUserHost {
  /** Why this profile may not ask (a Cognitive Routing worker), or undefined when it may. */
  refusal(ctx: any): string | undefined;
}

const textOf = (result: any) =>
  (result?.content ?? [])
    .filter((part: any) => part?.type === "text")
    .map((part: any) => part.text ?? "")
    .join("\n");

/** Registered once, declared only while Freeflow is effective outside subagents. */
export function registerAskUserTool(pi: any, host: AskUserHost): void {
  pi.registerTool({
    name: ASK_USER,
    label: "Question",
    description: DESCRIPTION,
    promptGuidelines: [GUIDELINE],
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        questions: {
          type: "array",
          minItems: 1,
          maxItems: MAX_QUESTIONS,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              question: { type: "string", description: "The full question, ending with a question mark." },
              header: {
                type: "string",
                description: `A label of at most ${MAX_HEADER} characters, such as "Default".`,
              },
              options: {
                type: "array",
                minItems: MIN_OPTIONS,
                maxItems: MAX_OPTIONS,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    label: { type: "string", description: "A few words; the recommended one first." },
                    description: { type: "string", description: "What choosing it means, and its tradeoff." },
                  },
                  required: ["label", "description"],
                },
              },
              multiSelect: { type: "boolean", description: "True when the user may choose more than one." },
            },
            required: ["question", "header", "options"],
          },
        },
      },
      required: ["questions"],
    },
    // It asks the user, so scripts must not call it, and its transcript views apply (see task_memory).
    exposure: "model-only",
    defaultActive: false,
    executionMode: "sequential",
    // One line each for what was asked and what the user answered; options and notes when expanded or short.
    renderCall: (args: any, theme: any, context: any) => {
      const questions = (Array.isArray(args?.questions) ? args.questions : []).filter((q: any) => q?.question);
      const title = paint(theme, "toolTitle", "Question");
      if (!questions.length) return new Text(title, 0, 0);
      const head =
        questions.length === 1
          ? `${title} · ${paint(theme, "accent", String(questions[0].header ?? ""))}: ${firstLine(questions[0].question, 120)}`
          : `${title} · ${questions.map((q: any) => paint(theme, "accent", String(q.header ?? ""))).join(", ")}`;
      const body = questions.flatMap((q: any) => [
        ...(questions.length > 1 ? [`${q.header}: ${q.question}`] : q.question.length > 120 ? [q.question] : []),
        ...(Array.isArray(q.options) ? q.options : []).map(
          (o: any) => `${questions.length > 1 ? "  " : ""}- ${o.label}${o.description ? ` — ${o.description}` : ""}`,
        ),
      ]);
      return foldRow(head, context?.expanded === true ? body : [], context?.expanded === true, theme);
    },
    renderResult: (result: any, options: any, theme: any) => {
      const outcome: AskOutcome | undefined = result?.details?.outcome;
      if (outcome?.status === "answered") {
        const lines = outcome.answers.map(
          (answer) =>
            `${answer.header}: ${answer.text !== undefined ? `"${answer.text}"` : answer.selected.join(", ")}${answer.note ? ` (note: ${answer.note})` : ""}`,
        );
        const head = paint(theme, "success", lines.length === 1 ? `Answered · ${lines[0]}` : "Answered");
        return foldRow(head, lines.length === 1 ? [] : lines, options?.expanded === true, theme);
      }
      if (outcome?.status === "dismissed")
        return new Text(paint(theme, "warning", "Closed without answering (Esc)"), 0, 0);
      return new Text(paint(theme, "warning", firstLine(textOf(result)) || "Not asked"), 0, 0);
    },
    async execute(_id: string, params: any, signal: AbortSignal, _update: unknown, ctx: any) {
      const refused = host.refusal(ctx);
      const checked = validateQuestions(params?.questions);
      let outcome: AskOutcome;
      if (refused) outcome = { status: "unavailable", reason: refused };
      else if ("error" in checked)
        return { content: [{ type: "text", text: checked.error }], details: {}, isError: true };
      else outcome = await askUser(ctx, checked.questions, signal);
      return {
        content: [{ type: "text", text: refused ? refused : outcomeText(outcome) }],
        details: { outcome },
        ...(outcome.status === "answered" ? {} : { isError: true }),
      };
    },
  });
}

/** Declare or withdraw ask_user, keeping other tools in place. */
export function applyAskUserTool(pi: any, effective: boolean): void {
  if (typeof pi.getActiveTools !== "function" || typeof pi.setActiveTools !== "function") return;
  const current: string[] = pi.getActiveTools();
  const present = current.includes(ASK_USER);
  if (effective && !present) pi.setActiveTools([...current, ASK_USER]);
  if (!effective && present) pi.setActiveTools(current.filter((name) => name !== ASK_USER));
}
