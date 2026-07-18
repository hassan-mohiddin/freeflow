import { type DelegationLayoutAllocation, type DelegationLayoutIntent, type DelegationLayoutPreset } from "./types.js";
export declare const DELEGATION_LAYOUT_PRESETS: readonly ["default-v1"];
export declare const DELEGATION_LAYOUT_GROUPS: readonly ["planning", "execution", "review", "scratch"];
export declare const DELEGATION_LAYOUT_REUSE_POLICIES: readonly ["reuse_role_pane", "new_surface", "new_pane", "none"];
export declare const DELEGATION_LAYOUT_SLOTS: readonly ["inline", "right-top", "right-bottom", "right-surface-overflow"];
export declare const DELEGATION_LAYOUT_INTENT_KINDS: readonly ["inline", "agent"];
export interface PlanDelegationLayoutAllocationInput {
    intent: DelegationLayoutIntent;
    existingAllocations?: DelegationLayoutAllocation[];
    refs?: {
        workspaceRef?: string;
        paneRef?: string;
        surfaceRef?: string;
    };
}
type DelegationLayoutIntentInput = Omit<DelegationLayoutIntent, "preset" | "preserveFocus"> & {
    preset?: DelegationLayoutPreset;
    preserveFocus?: boolean;
};
export declare function normalizeDelegationLayoutIntent(input: DelegationLayoutIntentInput): DelegationLayoutIntent;
export declare function planDelegationLayoutAllocation(input: PlanDelegationLayoutAllocationInput): DelegationLayoutAllocation;
export declare function normalizeDelegationLayoutAllocation(input: DelegationLayoutAllocation): DelegationLayoutAllocation;
export {};
