/*
 * The questions ask_user puts to the user, and the answers it returns: Claude Code's AskUserQuestion shape (1-4
 * questions, a short header each, 2-4 options with descriptions, multi-select), since models know it. Every question
 * also accepts the user's own words and a note; the dialog adds those, the model never lists them.
 */
export const MAX_QUESTIONS = 4;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;
export const MAX_HEADER = 12;
const text = (value) => (typeof value === "string" ? value.trim() : "");
/** The questions as given, or the first reason they cannot be asked. */
export function validateQuestions(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_QUESTIONS)
    return { error: `Ask 1 to ${MAX_QUESTIONS} questions.` };
  const questions = [];
  const headers = new Set();
  for (const [index, raw] of value.entries()) {
    const at = `Question ${index + 1}`;
    const question = text(raw?.question);
    const header = text(raw?.header);
    if (!question) return { error: `${at} has no question text.` };
    if (!header || header.length > MAX_HEADER)
      return { error: `${at} needs a header of 1 to ${MAX_HEADER} characters.` };
    if (headers.has(header)) return { error: `${at} repeats the header "${header}".` };
    headers.add(header);
    const options = Array.isArray(raw?.options) ? raw.options : [];
    if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS)
      return { error: `${at} needs ${MIN_OPTIONS} to ${MAX_OPTIONS} options.` };
    const labels = new Set();
    const normalized = [];
    for (const option of options) {
      const label = text(option?.label);
      if (!label) return { error: `${at} has an option with no label.` };
      if (/^other\b/i.test(label))
        return { error: `${at} lists "${label}": the dialog adds the user's own answer itself; remove it.` };
      if (labels.has(label)) return { error: `${at} repeats the option "${label}".` };
      labels.add(label);
      const description = text(option?.description);
      normalized.push(description ? { label, description } : { label });
    }
    questions.push({
      question,
      header,
      options: normalized,
      ...(raw?.multiSelect === true ? { multiSelect: true } : {}),
    });
  }
  return { questions };
}
/** What the model reads after the dialog. */
export function outcomeText(outcome) {
  if (outcome.status === "unavailable") return `${outcome.reason} Ask in your reply and end your turn.`;
  if (outcome.status === "dismissed")
    return "The user closed the dialog without answering. Do not act on the choice: ask in your reply, or continue only with work that does not depend on it.";
  const lines = ["The user answered in a dialog:"];
  for (const answer of outcome.answers) {
    lines.push(`- ${answer.header}: ${answer.question}`);
    if (answer.text !== undefined) lines.push(`  Answer, in their words: ${answer.text}`);
    else lines.push(`  Answer: ${answer.selected.join("; ")}`);
    if (answer.note) lines.push(`  Note: ${answer.note}`);
  }
  lines.push(
    "Each answer decides only its question. A note or written answer that asks something, sets a condition or asks for more information is not a decision: respond to it before acting.",
  );
  return lines.join("\n");
}
/** One line per answer, for the transcript. */
export function answerSummary(answers) {
  return answers
    .map((answer) => `${answer.header}: ${answer.text !== undefined ? `"${answer.text}"` : answer.selected.join(", ")}`)
    .join(" · ");
}
