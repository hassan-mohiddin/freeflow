import type { EvidencePacket, ObservedOutputNormalization, PreserveMode, ProducerDescriptor, RouterThresholds } from "../config/types.js";
export interface ObservedReducerInput {
    outputId: string;
    source: EvidencePacket["source"];
    preserve: PreserveMode;
    thresholds: RouterThresholds;
    text: string;
    rawValue?: unknown;
    normalized: ObservedOutputNormalization;
    producer?: ProducerDescriptor;
}
export interface ObservedReducerResult {
    reducer: string;
    routingStatus: "routed" | "partial";
    reason: string;
    summary: string;
    evidence: EvidencePacket[];
}
export interface ObservedReducer {
    name: string;
    supports(input: ObservedReducerInput): boolean;
    reduce(input: ObservedReducerInput): ObservedReducerResult;
}
export interface ObservedReducerRegistry {
    names(): string[];
    reduce(input: ObservedReducerInput): ObservedReducerResult;
}
export declare function createDefaultObservedReducerRegistry(): ObservedReducerRegistry;
export declare function reduceObservedOutput(input: ObservedReducerInput): ObservedReducerResult;
export declare function webSearchReducer(): ObservedReducer;
export declare function fetchReducer(): ObservedReducer;
export declare function codeSearchReducer(): ObservedReducer;
export declare function mcpReducer(): ObservedReducer;
export declare function genericTextReducer(): ObservedReducer;
export declare function jsonReducer(): ObservedReducer;
