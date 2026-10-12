// Test and one-time migration helper only; it is not part of the evaluator. Schema 2 is a breaking change
// (D-007): the evaluator loads no schema 1 definition and ships no converter. Tests keep their compact
// schema 1 builders and convert them when writing; the live definitions were converted with this once.
const SUBJECT_FIELDS = ["source", "skills", "target", "context"];

/**
 * Converts a schema 1 group or suite to schema 2 without changing what it evaluates.
 * The fields both variants share become the configuration's subject; the fields that differ become each
 * arm's overlay, and `component` names them. A definition that is already schema 2 is returned unchanged.
 *
 * @param {any} definition
 * @returns {any}
 */
export function toV2(definition) {
  if (definition?.schema_version !== 1) return definition;
  if (definition.kind === "suite") return { ...definition, schema_version: 2 };
  if (definition.kind !== "group") return definition;

  const { schema_version: _version, variants, model, runtime, ...task } = definition;
  const baseline = variants?.baseline ?? {};
  const candidate = variants?.candidate ?? {};
  const subject = { kind: "skill" };
  const arms = { baseline: {}, candidate: {} };
  const component = [];
  for (const field of SUBJECT_FIELDS) {
    if (JSON.stringify(baseline[field]) === JSON.stringify(candidate[field])) {
      subject[field] = baseline[field];
    } else {
      arms.baseline.subject = { ...arms.baseline.subject, [field]: baseline[field] };
      arms.candidate.subject = { ...arms.candidate.subject, [field]: candidate[field] };
      component.push(`subject.${field}`);
    }
  }

  const configuration = { host: { name: runtime?.host ?? "pi" } };
  if (model !== undefined) configuration.model = model;
  configuration.subject = subject;
  if (runtime !== undefined) {
    const { host: _host, ...rest } = runtime;
    configuration.runtime = rest;
  }

  const { id, type, input, fixture, tools, commands, revision, expectations, review_questions, ...unknown } = task;
  return {
    schema_version: 2,
    kind: "group",
    id,
    type,
    input,
    fixture,
    tools,
    ...(commands === undefined ? {} : { commands }),
    ...(revision === undefined ? {} : { revision }),
    configuration,
    arms,
    component,
    expectations,
    review_questions,
    // Fields schema 1 did not define are kept, so the schema 2 loader rejects them by name.
    ...unknown,
  };
}
