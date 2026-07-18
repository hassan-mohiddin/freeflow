export type CmuxRefKind = "window" | "workspace" | "pane" | "surface";
export interface CmuxRefs {
  windowRef?: string;
  workspaceRef?: string;
  paneRef?: string;
  surfaceRef?: string;
  raw: string;
}
export interface CmuxRunOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  signal?: AbortSignal;
}
export interface CmuxRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionStatus?: "success" | "failed" | "cancelled" | "timed_out";
  durationMs?: number;
}
export interface CmuxCommandRunner {
  run(command: readonly string[], options?: CmuxRunOptions): Promise<CmuxRunResult>;
}
export type DelegationUnavailableCode =
  | "cmux_binary_missing"
  | "cmux_command_unavailable"
  | "cmux_context_unavailable"
  | "child_pi_missing"
  | "store_unwritable";
export interface DelegationPreflightCheck {
  name: string;
  status: "ok" | "failed";
  message: string;
  command?: string[];
}
export interface DelegationPreflightOk {
  ok: true;
  status: "ready";
  checks: DelegationPreflightCheck[];
}
export interface DelegationPreflightUnavailable {
  ok: false;
  status: "unavailable";
  code: DelegationUnavailableCode;
  reason: string;
  actionTaken: "no_pane_opened_no_child_pi_started";
  safeRoutes: string[];
  checks: DelegationPreflightCheck[];
}
export type DelegationPreflightResult = DelegationPreflightOk | DelegationPreflightUnavailable;
export interface EnsureDelegationReadyInput {
  runner: CmuxCommandRunner;
  cwd?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  storeRoot: string;
  childPiCommand?: string;
  requiredCmuxCommands?: readonly string[];
  timeoutMs?: number;
}
export interface NewPaneInput {
  direction?: "left" | "right" | "up" | "down";
  workspaceRef?: string;
  windowRef?: string;
  focus?: boolean;
}
export interface CmuxCommandOutcome {
  command: string[];
  result: CmuxRunResult;
}
export interface CmuxNewPaneOutcome extends CmuxCommandOutcome {
  refs: CmuxRefs;
}
export interface CmuxReadScreenInput {
  surfaceRef: string;
  lines?: number;
  scrollback?: boolean;
  workspaceRef?: string;
  windowRef?: string;
}
export interface CmuxSendInput {
  surfaceRef: string;
  text: string;
  workspaceRef?: string;
  windowRef?: string;
}
export interface CmuxCloseSurfaceInput {
  surfaceRef: string;
  workspaceRef?: string;
  windowRef?: string;
}
export declare class CmuxAdapter {
  private readonly runner;
  private readonly defaultCwd;
  private readonly defaultTimeoutMs;
  constructor(
    runner: CmuxCommandRunner,
    options?: {
      cwd?: string;
      timeoutMs?: number;
    },
  );
  ensureReady(input: Omit<EnsureDelegationReadyInput, "runner">): Promise<DelegationPreflightResult>;
  newPane(input?: NewPaneInput): Promise<CmuxNewPaneOutcome>;
  send(input: CmuxSendInput): Promise<CmuxCommandOutcome>;
  sendKey(
    input: CmuxSendInput & {
      key: string;
    },
  ): Promise<CmuxCommandOutcome>;
  readScreen(input: CmuxReadScreenInput): Promise<CmuxCommandOutcome>;
  closeSurface(input: CmuxCloseSurfaceInput): Promise<CmuxCommandOutcome>;
  private runCmux;
}
export declare function ensureDelegationReady(input: EnsureDelegationReadyInput): Promise<DelegationPreflightResult>;
export declare function buildCmuxNewPaneCommand(input?: NewPaneInput): string[];
export declare function buildCmuxSendCommand(input: CmuxSendInput): string[];
export declare function buildCmuxSendKeyCommand(
  input: CmuxSendInput & {
    key: string;
  },
): string[];
export declare function buildCmuxReadScreenCommand(input: CmuxReadScreenInput): string[];
export declare function buildCmuxCloseSurfaceCommand(input: CmuxCloseSurfaceInput): string[];
export declare function parseCmuxRefs(output: string): CmuxRefs;
export declare function shellQuote(value: string): string;
