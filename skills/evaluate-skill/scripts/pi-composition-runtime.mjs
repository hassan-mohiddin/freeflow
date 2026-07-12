import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { runtimeContext, workflowBootstrapMessage, WORKFLOW_BOOTSTRAP_MESSAGE_TYPE } from "../../../pi-extension/dist/runtime-context.js";
import { sha256, stableJson } from "./lib/hash.mjs";

export const COMPOSITION_RUNTIME_PROFILE = "freeflow-kernel-workflow-v1";

const modeState = { defaultMode: "workflow", currentMode: null, effectiveMode: "workflow" };
const capabilityState = {
  configured: true,
  enabled: true,
  skills: { enabled: true, effective: true },
  outputRouter: { enabled: false },
  delegationHarness: { enabled: false },
};
const routerConfigResult = { config: { enabled: false } };

export function buildCompositionRuntimeContext(freeflowContext) {
  return runtimeContext(modeState, freeflowContext, routerConfigResult, capabilityState);
}

export function buildCompositionWorkflowEnvelope(workflowSkill) {
  return workflowBootstrapMessage(
    { workflowSkill },
    capabilityState,
    { buildContextEntries() { return []; }, getEntries() { return []; } },
  );
}

async function appendEvidence(path, record) {
  if (!path) return;
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`);
}

export function createCompositionRuntimeExtension({
  kernelPath = process.env.FREEFLOW_EVAL_RUNTIME_KERNEL,
  workflowPath = process.env.FREEFLOW_EVAL_RUNTIME_WORKFLOW,
  evidencePath = process.env.FREEFLOW_EVAL_RUNTIME_EVIDENCE,
} = {}) {
  if (!kernelPath || !workflowPath) throw new Error("Composition runtime requires declared kernel and Workflow paths");
  let resourcesPromise;
  const resources = () => {
    resourcesPromise ??= Promise.all([readFile(kernelPath, "utf8"), readFile(workflowPath, "utf8")]).then(([runtimeKernel, workflowSkill]) => ({ runtimeKernel, workflowSkill }));
    return resourcesPromise;
  };

  return function compositionRuntime(pi) {
    let beforeAgentStarts = 0;
    pi.on("before_agent_start", async (event, ctx) => {
      const freeflowContext = await resources();
      const contextText = buildCompositionRuntimeContext(freeflowContext);
      const message = workflowBootstrapMessage(freeflowContext, capabilityState, ctx.sessionManager);
      const systemPrompt = `${event.systemPrompt}\n\n${contextText}`;
      const deliveryReason = message
        ? (beforeAgentStarts === 0 ? "initial" : "active-marker-missing")
        : "suppressed-active-marker";
      beforeAgentStarts += 1;
      await appendEvidence(evidencePath, {
        type: "freeflow-composition-runtime-delivery",
        profile: COMPOSITION_RUNTIME_PROFILE,
        kernel_sha256: sha256(freeflowContext.runtimeKernel),
        workflow_sha256: sha256(freeflowContext.workflowSkill),
        runtime_context_sha256: sha256(contextText),
        system_prompt_sha256: sha256(systemPrompt),
        workflow_custom_type: WORKFLOW_BOOTSTRAP_MESSAGE_TYPE,
        workflow_delivered: Boolean(message),
        workflow_delivery_reason: deliveryReason,
        workflow_envelope_sha256: message ? sha256(stableJson(message)) : null,
      });
      return { message, systemPrompt };
    });
  };
}

export default function compositionRuntimeFromEnvironment(pi) {
  return createCompositionRuntimeExtension()(pi);
}
