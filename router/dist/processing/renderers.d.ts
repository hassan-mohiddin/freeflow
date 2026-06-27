import type { EvidencePersistence, RecoveryHint } from "../config/types.js";
import type { ProcessingFact, ProcessingSourceDescriptor, ProcessingSourceStats, ReducerSelectionResult, ScriptPolicySelectionResult } from "./engine.js";
export type ProcessingRecoveryClass = "exact-result" | "exact-source" | "metadata-only" | "hint-only" | "none";
export interface ProcessingRenderInput {
    status: "ok" | "blocked" | "unavailable";
    source: ProcessingSourceDescriptor;
    facts: readonly ProcessingFact[];
    maxVisibleBytes: number;
    stats?: ProcessingSourceStats;
    reducer?: ReducerSelectionResult;
    script?: ScriptPolicySelectionResult;
    recovery?: RecoveryHint;
    persistence?: EvidencePersistence;
    recoveryClass?: ProcessingRecoveryClass;
    failure?: {
        policy?: string;
        reason: string;
    };
}
export declare function renderProcessingResult(input: ProcessingRenderInput): string;
export declare function classifyProcessingRecovery(input: {
    recovery?: RecoveryHint;
    persistence?: EvidencePersistence;
    resultWillBePersisted?: boolean;
}): ProcessingRecoveryClass;
